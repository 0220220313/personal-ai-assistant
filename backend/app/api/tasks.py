from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import json

from ..db.database import get_db
from ..db.models import Task, Project
from ..core.gemini import extract_tasks_from_text

router = APIRouter(prefix="/tasks", tags=["tasks"])

class TaskCreate(BaseModel):
    title: str
    description: str = ""
    priority: str = "medium"
    assignee: str = ""
    due_date: str = ""
    status: str = "todo"

class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    priority: Optional[str] = None
    assignee: Optional[str] = None
    due_date: Optional[str] = None

class AIGenerateRequest(BaseModel):
    text: str   # 要讓 AI 分析的文字

@router.get("/{project_id}")
async def list_tasks(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Task)
        .where(Task.project_id == project_id)
        .order_by(Task.created_at.asc())
    )
    tasks = result.scalars().all()
    return [
        {
            "id": t.id,
            "title": t.title,
            "description": t.description,
            "status": t.status,
            "priority": t.priority,
            "assignee": t.assignee,
            "due_date": t.due_date,
            "source_msg": t.source_msg,
            "created_at": str(t.created_at),
            "updated_at": str(t.updated_at),
        }
        for t in tasks
    ]

@router.post("/{project_id}")
async def create_task(
    project_id: str,
    body: TaskCreate,
    db: AsyncSession = Depends(get_db)
):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    if not proj.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="專案不存在")

    task = Task(
        project_id=project_id,
        title=body.title,
        description=body.description,
        priority=body.priority,
        assignee=body.assignee,
        due_date=body.due_date,
        status=body.status,
    )
    db.add(task)
    await db.commit()
    await db.refresh(task)
    return {"id": task.id, "title": task.title, "status": task.status}

@router.patch("/{task_id}")
async def update_task(
    task_id: str,
    body: TaskUpdate,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任務不存在")

    if body.title is not None:       task.title = body.title
    if body.description is not None: task.description = body.description
    if body.status is not None:      task.status = body.status
    if body.priority is not None:    task.priority = body.priority
    if body.assignee is not None:    task.assignee = body.assignee
    if body.due_date is not None:    task.due_date = body.due_date

    await db.commit()
    return {"success": True}

@router.delete("/{task_id}")
async def delete_task(task_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Task).where(Task.id == task_id))
    task = result.scalar_one_or_none()
    if not task:
        raise HTTPException(status_code=404, detail="任務不存在")
    await db.delete(task)
    await db.commit()
    return {"success": True}

@router.post("/{project_id}/ai-generate")
async def ai_generate_tasks(
    project_id: str,
    body: AIGenerateRequest,
    db: AsyncSession = Depends(get_db)
):
    """讓 AI 從文字中自動提取任務並批量建立"""
    proj = await db.execute(select(Project).where(Project.id == project_id))
    if not proj.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="專案不存在")

    extracted = await extract_tasks_from_text(body.text)
    created = []

    for t in extracted:
        task = Task(
            project_id=project_id,
            title=t.get("title", "未命名任務"),
            description=t.get("description", ""),
            priority=t.get("priority", "medium"),
            due_date=t.get("due_date", ""),
        )
        db.add(task)
        created.append(task)

    await db.commit()
    return {"created": len(created), "tasks": [{"id": t.id, "title": t.title} for t in created]}
