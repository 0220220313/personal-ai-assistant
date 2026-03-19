"""
聊天 API — google-genai 新版 SDK + Function Calling
SSE 格式:
  {"type":"text","content":"..."}
  {"type":"action","action":"task_created","data":{...}}
  {"type":"action","action":"command_sent","data":{...}}
  {"type":"action","action":"memory_saved","data":{...}}
  {"type":"done","message_id":"..."}
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import json, asyncio
from datetime import datetime, date

from ..db.database import get_db
from ..db.models import Project, Message, File, Task, ProjectMemory, AgentCommand
from ..core.gemini import get_client, extract_tasks_from_text
from .agent import manager as agent_manager

try:
    from google.genai import types
except ImportError:
    pass  # fallback removed

router = APIRouter(prefix="/chat", tags=["chat"])

# ── Request Model ─────────────────────────────────────────
class ChatRequest(BaseModel):
    project_id: str
    message: str
    file_ids: list[str] = []

# ── Function Declarations (新版 SDK)──────────────────────
def _make_tools():
    return [types.Tool(function_declarations=[
        types.FunctionDeclaration(
            name="create_task",
            description="在目前專案中建立一個看板任務",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "title":       types.Schema(type=types.Type.STRING, description="任務標題"),
                    "description": types.Schema(type=types.Type.STRING, description="任務描述"),
                    "status":      types.Schema(type=types.Type.STRING, description="todo/in_progress/done"),
                    "priority":    types.Schema(type=types.Type.STRING, description="high/medium/low"),
                },
                required=["title"]
            )
        ),
        types.FunctionDeclaration(
            name="send_agent_command",
            description="傳送自然語言指令給電腦端 Agent 在 Windows 上執行",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "command": types.Schema(type=types.Type.STRING, description="自然語言指令"),
                },
                required=["command"]
            )
        ),
        types.FunctionDeclaration(
            name="save_memory",
            description="儲存重要資訊到專案記憶中，以便未來對話使用",
            parameters=types.Schema(
                type=types.Type.OBJECT,
                properties={
                    "key":   types.Schema(type=types.Type.STRING, description="記憶識別鍵"),
                    "value": types.Schema(type=types.Type.STRING, description="要記住的內容"),
                },
                required=["key","value"]
            )
        ),
        types.FunctionDeclaration(
            name="get_memories",
            description="取得專案的所有記憶（可主動呼叫以取得背景資訊）",
            parameters=types.Schema(type=types.Type.OBJECT, properties={})
        ),
    ])]

# ── 執行工具 ──────────────────────────────────────────────
async def _exec_tool(name: str, args: dict, project_id: str, db: AsyncSession):
    """回傳 (tool_result_dict, action_event_or_None)"""
    if name == "create_task":
        task = Task(
            project_id=project_id,
            title=args.get("title","未命名任務"),
            description=args.get("description",""),
            status=args.get("status","todo"),
            priority=args.get("priority","medium"),
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)
        result = {"success":True,"task_id":task.id,"title":task.title,"status":task.status}
        event  = {"type":"action","action":"task_created",
                  "data":{"id":task.id,"title":task.title,"status":task.status,"description":task.description}}
        return result, event

    elif name == "send_agent_command":
        cmd_text = args.get("command","")
        cmd = AgentCommand(command=cmd_text, status="pending")
        db.add(cmd)
        await db.commit()
        await db.refresh(cmd)
        sent = await agent_manager.send_command_to_agent({
            "type":"command","id":cmd.id,"command":cmd_text,
            "timestamp":datetime.now().isoformat()
        })
        result = {"success":True,"command_id":cmd.id,"agent_online":sent}
        event  = {"type":"action","action":"command_sent",
                  "data":{"id":cmd.id,"command":cmd_text,"agent_online":sent}}
        return result, event

    elif name == "save_memory":
        key, value = args.get("key",""), args.get("value","")
        row = (await db.execute(
            select(ProjectMemory).where(
                ProjectMemory.project_id==project_id, ProjectMemory.key==key)
        )).scalar_one_or_none()
        if row:
            row.value = value
        else:
            db.add(ProjectMemory(project_id=project_id, key=key, value=value))
        await db.commit()
        result = {"success":True,"key":key,"value":value}
        event  = {"type":"action","action":"memory_saved","data":{"key":key,"value":value}}
        return result, event

    elif name == "get_memories":
        mems = (await db.execute(
            select(ProjectMemory).where(ProjectMemory.project_id==project_id)
        )).scalars().all()
        return {"memories":{m.key:m.value for m in mems}}, None

    return {"error":f"未知工具: {name}"}, None

# ── 串流端點 ──────────────────────────────────────────────
@router.post("/stream")
async def chat_stream(body: ChatRequest, db: AsyncSession = Depends(get_db)):
    import os
    project = (await db.execute(
        select(Project).where(Project.id==body.project_id)
    )).scalar_one_or_none()
    if not project:
        raise HTTPException(404, "專案不存在")

    # 歷史訊息
    hist = (await db.execute(
        select(Message).where(Message.project_id==body.project_id)
        .order_by(Message.created_at.asc())
    )).scalars().all()

    # 記憶
    mems = (await db.execute(
        select(ProjectMemory).where(ProjectMemory.project_id==body.project_id)
    )).scalars().all()
    mem_text = "\n".join(f"- {m.key}: {m.value}" for m in mems) or "（目前無記憶）"

    # 知識庫
    kb = (await db.execute(
        select(File).where(File.project_id==body.project_id, File.is_indexed==True)
    )).scalars().all()
    kb_text = "\n".join(f"- {f.original_name}" for f in kb) or "（尚無檔案）"

    # 儲存用戶訊息
    user_msg = Message(project_id=body.project_id, role="user",
                       content=body.message, file_refs=json.dumps(body.file_ids))
    db.add(user_msg)
    await db.commit()

    system_prompt = f"""你是個人 AI 助理，協助管理專案「{project.name}」。

今天：{date.today().strftime('%Y-%m-%d')}

專案記憶：
{mem_text}

知識庫檔案：
{kb_text}

可用工具：
- create_task：建立看板任務
- send_agent_command：控制 Windows 電腦執行操作
- save_memory：儲存重要資訊供未來對話使用
- get_memories：查詢已儲存的記憶

請用繁體中文回答，適當使用 Markdown，引用文件時標明 [來源: 文件名]。"""

    # 組合 contents
    contents: list[types.Content] = []
    for m in hist:
        role = "model" if m.role == "assistant" else "user"
        contents.append(types.Content(role=role, parts=[types.Part(text=m.content)]))

    # 最後一則（可含檔案）
    last_parts: list[types.Part] = []
    if body.file_ids:
        sel = (await db.execute(
            select(File).where(File.id.in_(body.file_ids), File.project_id==body.project_id)
        )).scalars().all()
        client = get_client()
        for f in sel:
            if f.gemini_file_uri:
                try:
                    fref = await asyncio.to_thread(client.files.get, name=f.gemini_file_uri)
                    last_parts.append(types.Part(file_data=types.FileData(
                        file_uri=fref.uri, mime_type=fref.mime_type)))
                except Exception as e:
                    print(f"[Chat] 檔案載入失敗: {e}")

    last_parts.append(types.Part(text=body.message))
    contents.append(types.Content(role="user", parts=last_parts))

    async def generate():
        nonlocal contents
        full_response = ""
        client = get_client()
        model_name = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
        loop = asyncio.get_event_loop()
        tools = _make_tools()

        try:
            # 1. 先非串流執行（處理 function calling）
            config = types.GenerateContentConfig(
                system_instruction=system_prompt,
                tools=tools,
                temperature=0.7,
                max_output_tokens=8192,
            )

            response = await loop.run_in_executor(
                None, lambda: client.models.generate_content(
                    model=model_name, contents=contents, config=config)
            )

            # 2. 處理 function calls（可能多輪）
            while True:
                fc_parts = [p for p in response.candidates[0].content.parts
                            if hasattr(p, "function_call") and p.function_call and p.function_call.name]
                if not fc_parts:
                    break

                # 加入 model 回應到 contents
                contents.append(response.candidates[0].content)

                fn_resp_parts = []
                for part in fc_parts:
                    fc = part.function_call
                    tool_result, action_event = await _exec_tool(
                        fc.name, dict(fc.args) if fc.args else {}, body.project_id, db
                    )
                    if action_event:
                        yield f"data: {json.dumps(action_event, ensure_ascii=False)}\n\n"

                    fn_resp_parts.append(types.Part(
                        function_response=types.FunctionResponse(
                            name=fc.name, response={"result": tool_result}
                        )
                    ))

                contents.append(types.Content(role="user", parts=fn_resp_parts))

                # 繼續對話
                cfg_no_tools = types.GenerateContentConfig(
                    system_instruction=system_prompt,
                    temperature=0.7,
                    max_output_tokens=8192,
                )
                response = await loop.run_in_executor(
                    None, lambda: client.models.generate_content(
                        model=model_name, contents=contents, config=cfg_no_tools)
                )

            # 3. 串流最終文字回應
            final_text = ""
            for part in response.candidates[0].content.parts:
                if hasattr(part, "text") and part.text:
                    final_text += part.text

            if final_text:
                # 分塊模擬串流
                chunk_size = 40
                for i in range(0, len(final_text), chunk_size):
                    chunk = final_text[i:i+chunk_size]
                    full_response += chunk
                    yield f"data: {json.dumps({'type':'text','content':chunk}, ensure_ascii=False)}\n\n"
                    await asyncio.sleep(0.015)
            else:
                # fallback: 重新串流
                queue: asyncio.Queue = asyncio.Queue()
                def _stream():
                    try:
                        for chunk in client.models.generate_content_stream(
                            model=model_name, contents=contents,
                            config=types.GenerateContentConfig(
                                system_instruction=system_prompt,
                                temperature=0.7, max_output_tokens=8192)
                        ):
                            if chunk.text:
                                loop.call_soon_threadsafe(queue.put_nowait, chunk.text)
                    finally:
                        loop.call_soon_threadsafe(queue.put_nowait, None)
                loop.run_in_executor(None, _stream)
                while True:
                    t = await queue.get()
                    if t is None:
                        break
                    full_response += t
                    yield f"data: {json.dumps({'type':'text','content':t}, ensure_ascii=False)}\n\n"

        except Exception as e:
            err = f"[錯誤] {e}"
            full_response = err
            yield f"data: {json.dumps({'type':'text','content':err}, ensure_ascii=False)}\n\n"

        # 儲存 AI 訊息
        try:
            ai_msg = Message(project_id=body.project_id, role="assistant", content=full_response)
            db.add(ai_msg)
            await db.commit()
            yield f"data: {json.dumps({'type':'done','message_id':ai_msg.id}, ensure_ascii=False)}\n\n"
        except Exception as e:
            print(f"[Chat] 儲存失敗: {e}")

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})


@router.get("/{project_id}/history")
async def get_history(project_id: str, limit: int = 50, db: AsyncSession = Depends(get_db)):
    msgs = (await db.execute(
        select(Message).where(Message.project_id==project_id)
        .order_by(Message.created_at.asc()).limit(limit)
    )).scalars().all()
    return [{"id":m.id,"role":m.role,"content":m.content,
             "file_refs":json.loads(m.file_refs or "[]"),"created_at":str(m.created_at)}
            for m in msgs]


@router.delete("/{project_id}/history")
async def clear_history(project_id: str, db: AsyncSession = Depends(get_db)):
    for msg in (await db.execute(
        select(Message).where(Message.project_id==project_id)
    )).scalars().all():
        await db.delete(msg)
    await db.commit()
    return {"success": True}


@router.post("/{message_id}/extract-tasks")
async def extract_tasks(message_id: str, db: AsyncSession = Depends(get_db)):
    msg = (await db.execute(select(Message).where(Message.id==message_id))).scalar_one_or_none()
    if not msg:
        raise HTTPException(404, "訊息不存在")
    tasks = await extract_tasks_from_text(msg.content)
    return {"tasks": tasks}
