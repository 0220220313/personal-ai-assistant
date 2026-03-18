"""
聊天 API - 支援 Gemini Function Calling
工具：建立任務、傳送 Agent 指令、儲存/取得記憶
SSE 串流格式：
  {"type": "text", "content": "..."}
  {"type": "action", "action": "task_created", "data": {...}}
  {"type": "action", "action": "command_sent", "data": {...}}
  {"type": "action", "action": "memory_saved", "data": {...}}
  {"type": "done", "message_id": "..."}
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import json
import asyncio
from datetime import datetime, date

import google.generativeai as genai

from ..db.database import get_db
from ..db.models import Project, Message, File, Task, ProjectMemory
from ..core.gemini import SAFETY_SETTINGS, extract_tasks_from_text
from .agent import manager as agent_manager

router = APIRouter(prefix="/chat", tags=["chat"])

# ── Pydantic Models ─────────────────────────────────────
class ChatRequest(BaseModel):
    project_id: str
    message: str
    file_ids: list[str] = []
    use_knowledge_base: bool = True

# ── Gemini Function Declarations ────────────────────────
TOOLS = [
    genai.protos.Tool(
        function_declarations=[
            genai.protos.FunctionDeclaration(
                name="create_task",
                description="在目前專案中建立一個看板任務",
                parameters=genai.protos.Schema(
                    type=genai.protos.Type.OBJECT,
                    properties={
                        "title": genai.protos.Schema(
                            type=genai.protos.Type.STRING,
                            description="任務標題"
                        ),
                        "description": genai.protos.Schema(
                            type=genai.protos.Type.STRING,
                            description="任務描述（可選）"
                        ),
                        "status": genai.protos.Schema(
                            type=genai.protos.Type.STRING,
                            description="任務狀態：todo / in_progress / done，預設 todo"
                        ),
                    },
                    required=["title"]
                )
            ),
            genai.protos.FunctionDeclaration(
                name="send_agent_command",
                description="傳送自然語言指令給 Windows Agent 在電腦上執行",
                parameters=genai.protos.Schema(
                    type=genai.protos.Type.OBJECT,
                    properties={
                        "command": genai.protos.Schema(
                            type=genai.protos.Type.STRING,
                            description="要執行的自然語言指令，例如：整理桌面 PDF 到「文件」資料夾"
                        ),
                    },
                    required=["command"]
                )
            ),
            genai.protos.FunctionDeclaration(
                name="save_memory",
                description="將重要資訊儲存到專案記憶中，以便未來對話使用",
                parameters=genai.protos.Schema(
                    type=genai.protos.Type.OBJECT,
                    properties={
                        "key": genai.protos.Schema(
                            type=genai.protos.Type.STRING,
                            description="記憶的識別鍵，例如 user_preference、project_goal"
                        ),
                        "value": genai.protos.Schema(
                            type=genai.protos.Type.STRING,
                            description="要記住的內容"
                        ),
                    },
                    required=["key", "value"]
                )
            ),
            genai.protos.FunctionDeclaration(
                name="get_memories",
                description="取得目前專案的所有記憶（AI 可主動呼叫以取得背景資訊）",
                parameters=genai.protos.Schema(
                    type=genai.protos.Type.OBJECT,
                    properties={}
                )
            ),
        ]
    )
]

# ── Helper: Execute Tool Calls ──────────────────────────
async def _execute_tool_call(
    func_name: str,
    func_args: dict,
    project_id: str,
    db: AsyncSession
) -> tuple[dict, dict]:
    """
    執行工具呼叫，回傳 (tool_result_for_gemini, action_event_for_sse)
    """
    if func_name == "create_task":
        title = func_args.get("title", "未命名任務")
        description = func_args.get("description", "")
        status = func_args.get("status", "todo")

        task = Task(
            project_id=project_id,
            title=title,
            description=description,
            status=status,
        )
        db.add(task)
        await db.commit()
        await db.refresh(task)

        tool_result = {"success": True, "task_id": task.id, "title": task.title, "status": task.status}
        action_event = {
            "type": "action",
            "action": "task_created",
            "data": {"id": task.id, "title": task.title, "status": task.status, "description": description}
        }
        return tool_result, action_event

    elif func_name == "send_agent_command":
        command = func_args.get("command", "")
        from ..db.models import AgentCommand
        cmd = AgentCommand(command=command, status="pending")
        db.add(cmd)
        await db.commit()
        await db.refresh(cmd)

        sent = await agent_manager.send_command_to_agent({
            "type": "command",
            "id": cmd.id,
            "command": command,
            "timestamp": datetime.now().isoformat()
        })

        tool_result = {"success": True, "command_id": cmd.id, "agent_online": sent}
        action_event = {
            "type": "action",
            "action": "command_sent",
            "data": {"id": cmd.id, "command": command, "agent_online": sent}
        }
        return tool_result, action_event

    elif func_name == "save_memory":
        key = func_args.get("key", "")
        value = func_args.get("value", "")

        existing = await db.execute(
            select(ProjectMemory).where(
                ProjectMemory.project_id == project_id,
                ProjectMemory.key == key
            )
        )
        mem = existing.scalar_one_or_none()
        if mem:
            mem.value = value
            mem.updated_at = datetime.utcnow()
        else:
            mem = ProjectMemory(project_id=project_id, key=key, value=value)
            db.add(mem)
        await db.commit()

        tool_result = {"success": True, "key": key, "value": value}
        action_event = {
            "type": "action",
            "action": "memory_saved",
            "data": {"key": key, "value": value}
        }
        return tool_result, action_event

    elif func_name == "get_memories":
        result = await db.execute(
            select(ProjectMemory).where(ProjectMemory.project_id == project_id)
        )
        memories = result.scalars().all()
        mem_dict = {m.key: m.value for m in memories}
        tool_result = {"memories": mem_dict}
        action_event = None  # 不向前端推送 get_memories 事件
        return tool_result, action_event

    else:
        return {"error": f"Unknown function: {func_name}"}, None


# ── Helper: Build History ───────────────────────────────
def _build_gemini_history(messages: list[Message]) -> list[dict]:
    history = []
    for msg in messages:
        role = "model" if msg.role == "assistant" else "user"
        history.append({"role": role, "parts": [msg.content]})
    return history


def _get_mime(file_type: str) -> str:
    return {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image": "image/jpeg",
        "txt": "text/plain",
    }.get(file_type, "application/octet-stream")


# ── Main Chat Stream Endpoint ───────────────────────────
@router.post("/stream")
async def chat_stream(body: ChatRequest, db: AsyncSession = Depends(get_db)):
    # 確認專案存在
    proj = await db.execute(select(Project).where(Project.id == body.project_id))
    project = proj.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="專案不存在")

    # 載入對話歷史
    hist_r = await db.execute(
        select(Message)
        .where(Message.project_id == body.project_id)
        .order_by(Message.created_at.asc())
    )
    history_msgs = hist_r.scalars().all()

    # 取得專案記憶
    mem_r = await db.execute(
        select(ProjectMemory).where(ProjectMemory.project_id == body.project_id)
    )
    memories = mem_r.scalars().all()
    memories_text = "\n".join(f"- {m.key}: {m.value}" for m in memories) if memories else "（目前無記憶）"

    # 取得知識庫檔案列表
    files_r = await db.execute(
        select(File).where(File.project_id == body.project_id, File.is_indexed == True)
    )
    kb_files = files_r.scalars().all()
    files_text = "\n".join(f"- {f.original_name} ({f.file_type})" for f in kb_files) if kb_files else "（目前無檔案）"

    # 取得引用的 Gemini 檔案
    gemini_file_parts = []
    if body.file_ids:
        sel_files_r = await db.execute(
            select(File).where(
                File.id.in_(body.file_ids),
                File.project_id == body.project_id
            )
        )
        sel_files = sel_files_r.scalars().all()
        for f in sel_files:
            if f.gemini_file_uri:
                gemini_file_parts.append({
                    "file_data": {
                        "mime_type": _get_mime(f.file_type),
                        "file_uri": f.gemini_file_uri
                    }
                })

    # 儲存用戶訊息
    user_msg = Message(
        project_id=body.project_id,
        role="user",
        content=body.message,
        file_refs=json.dumps(body.file_ids)
    )
    db.add(user_msg)
    await db.commit()

    # 系統 Prompt
    today = date.today().strftime("%Y-%m-%d")
    system_prompt = f"""你是一個全能的個人 AI 助理，協助管理專案「{project.name}」。

專案資訊：
- 名稱：{project.name}
- 描述：{project.description}
- 標籤顏色：{project.color}

今天的日期：{today}

專案記憶（重要背景資訊）：
{memories_text}

知識庫中的檔案：
{files_text}

可用工具：
- create_task：當用戶要求建立任務時使用
- send_agent_command：當用戶要求在 Windows 電腦上執行操作時使用
- save_memory：當對話中出現重要偏好、目標或需要記住的資訊時使用
- get_memories：當你需要查看已儲存的記憶時使用

回答時請：
- 使用繁體中文
- 結構清晰，適當使用 Markdown 格式
- 引用文件內容時標明 [來源: 文件名稱]
- 主動使用工具完成用戶的需求"""

    # 組合 Gemini 對話歷史
    gemini_history = _build_gemini_history(history_msgs)

    # 準備最後一條用戶訊息的 parts（可能含檔案）
    last_user_parts = []
    if gemini_file_parts:
        last_user_parts.extend(gemini_file_parts)
    last_user_parts.append(body.message)

    async def generate():
        full_response = ""
        action_events = []

        try:
            model_name = __import__("os").getenv("GEMINI_MODEL", "gemini-2.0-flash")
            model = genai.GenerativeModel(
                model_name=model_name,
                system_instruction=system_prompt,
                safety_settings=SAFETY_SETTINGS,
                tools=TOOLS
            )

            # 構建包含最後消息的完整歷史
            contents = list(gemini_history)
            contents.append({"role": "user", "parts": last_user_parts})

            # Step 1: 非串流呼叫，取得 function call（如有）
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: model.generate_content(
                    contents,
                    generation_config=genai.types.GenerationConfig(temperature=0.7)
                )
            )

            # 處理 function calls
            tool_call_contents = list(contents)
            while True:
                has_function_call = False

                for candidate in response.candidates:
                    for part in candidate.content.parts:
                        if hasattr(part, "function_call") and part.function_call.name:
                            has_function_call = True
                            fc = part.function_call
                            func_name = fc.name
                            func_args = dict(fc.args) if fc.args else {}

                            # 執行工具
                            tool_result, action_event = await _execute_tool_call(
                                func_name, func_args, body.project_id, db
                            )

                            # 傳送 action 事件到前端
                            if action_event:
                                action_events.append(action_event)
                                yield f"data: {json.dumps(action_event, ensure_ascii=False)}\n\n"

                            # 加入 function call + result 到對話歷史
                            tool_call_contents.append({
                                "role": "model",
                                "parts": [{"function_call": {"name": func_name, "args": func_args}}]
                            })
                            tool_call_contents.append({
                                "role": "user",
                                "parts": [{"function_response": {"name": func_name, "response": tool_result}}]
                            })

                if not has_function_call:
                    # 沒有更多 function call，取得最終文字回應
                    break

                # 繼續呼叫以取得下一個回應
                response = await loop.run_in_executor(
                    None,
                    lambda: model.generate_content(
                        tool_call_contents,
                        generation_config=genai.types.GenerationConfig(temperature=0.7)
                    )
                )

            # Step 2: 串流最終文字回應
            # 若最後的 response 已有文字，直接用；否則重新 stream
            final_text = ""
            try:
                for candidate in response.candidates:
                    for part in candidate.content.parts:
                        if hasattr(part, "text") and part.text:
                            final_text += part.text
            except Exception:
                pass

            if final_text:
                # 分塊輸出（模擬串流）
                chunk_size = 50
                for i in range(0, len(final_text), chunk_size):
                    chunk = final_text[i:i+chunk_size]
                    full_response += chunk
                    yield f"data: {json.dumps({'type': 'text', 'content': chunk}, ensure_ascii=False)}\n\n"
                    await asyncio.sleep(0.02)
            else:
                # 重新用 stream=True 取得回應
                stream_contents = list(tool_call_contents) if any(
                    "function_call" in str(c) for c in tool_call_contents
                ) else list(contents)

                stream_response = await loop.run_in_executor(
                    None,
                    lambda: model.generate_content(
                        stream_contents,
                        stream=True,
                        generation_config=genai.types.GenerationConfig(temperature=0.7)
                    )
                )
                for chunk in stream_response:
                    if chunk.text:
                        full_response += chunk.text
                        yield f"data: {json.dumps({'type': 'text', 'content': chunk.text}, ensure_ascii=False)}\n\n"

        except Exception as e:
            error_msg = f"[錯誤] {str(e)}"
            full_response = error_msg
            yield f"data: {json.dumps({'type': 'text', 'content': error_msg}, ensure_ascii=False)}\n\n"

        # 儲存 AI 回覆
        try:
            ai_msg = Message(
                project_id=body.project_id,
                role="assistant",
                content=full_response
            )
            db.add(ai_msg)
            await db.commit()
            yield f"data: {json.dumps({'type': 'done', 'message_id': ai_msg.id}, ensure_ascii=False)}\n\n"
        except Exception as e:
            print(f"[Chat] Failed to save message: {e}")

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"}
    )


@router.get("/{project_id}/history")
async def get_history(
    project_id: str,
    limit: int = 50,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Message)
        .where(Message.project_id == project_id)
        .order_by(Message.created_at.asc())
        .limit(limit)
    )
    messages = result.scalars().all()
    return [
        {
            "id": m.id,
            "role": m.role,
            "content": m.content,
            "file_refs": json.loads(m.file_refs or "[]"),
            "created_at": str(m.created_at),
        }
        for m in messages
    ]


@router.delete("/{project_id}/history")
async def clear_history(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Message).where(Message.project_id == project_id)
    )
    for msg in result.scalars().all():
        await db.delete(msg)
    await db.commit()
    return {"success": True}


@router.post("/{message_id}/extract-tasks")
async def extract_tasks(message_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Message).where(Message.id == message_id))
    msg = result.scalar_one_or_none()
    if not msg:
        raise HTTPException(status_code=404, detail="訊息不存在")
    tasks = await extract_tasks_from_text(msg.content)
    return {"tasks": tasks}
