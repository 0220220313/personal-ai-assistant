from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import json

from ..db.database import get_db
from ..db.models import Project, Message, File
from ..core.gemini import stream_chat, extract_tasks_from_text

router = APIRouter(prefix="/chat", tags=["chat"])

class ChatRequest(BaseModel):
    project_id: str
    message: str
    file_ids: list[str] = []      # 本次對話要引用的檔案
    use_knowledge_base: bool = True

def _build_gemini_history(messages: list[Message]) -> list[dict]:
    """將資料庫訊息轉換為 Gemini 格式"""
    history = []
    for msg in messages:
        role = "model" if msg.role == "assistant" else "user"
        history.append({"role": role, "parts": [msg.content]})
    return history

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

    # 儲存用戶訊息
    user_msg = Message(
        project_id=body.project_id,
        role="user",
        content=body.message,
        file_refs=json.dumps(body.file_ids)
    )
    db.add(user_msg)
    await db.commit()

    # 取得引用的 Gemini 檔案
    gemini_files = []
    if body.file_ids:
        files_r = await db.execute(
            select(File).where(
                File.id.in_(body.file_ids),
                File.project_id == body.project_id
            )
        )
        files = files_r.scalars().all()
        for f in files:
            if f.gemini_file_uri:
                gemini_files.append({
                    "file_data": {
                        "mime_type": _get_mime(f.file_type),
                        "file_uri": f.gemini_file_uri
                    }
                })

    # 組合對話歷史
    gemini_history = _build_gemini_history(history_msgs)
    gemini_history.append({"role": "user", "parts": [body.message]})

    # 加上專案系統提示
    system = f"""你正在協助管理專案「{project.name}」。
專案描述：{project.description}
請根據專案背景和對話歷史提供相關協助。"""

    async def generate():
        full_response = ""
        async for chunk in stream_chat(
            messages=gemini_history,
            system_prompt=system,
            files=gemini_files
        ):
            full_response += chunk
            yield f"data: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"

        # 儲存 AI 回覆
        async with db.begin():
            ai_msg = Message(
                project_id=body.project_id,
                role="assistant",
                content=full_response
            )
            db.add(ai_msg)

        yield f"data: {json.dumps({'done': True, 'message_id': ai_msg.id}, ensure_ascii=False)}\n\n"

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

def _get_mime(file_type: str) -> str:
    return {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "image": "image/jpeg",
        "txt": "text/plain",
    }.get(file_type, "application/octet-stream")
