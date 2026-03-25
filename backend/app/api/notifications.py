from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from datetime import date
import os

from ..db.database import get_db
from ..db.models import (
    Project, Task, PushSubscription,
    ProjectNotificationSetting, NotificationLog
)
from ..core.gemini import get_gemini_client

router = APIRouter(tags=["notifications"])


# ── Schemas ──────────────────────────────────────────
class NotificationSettingUpdate(BaseModel):
    summary_schedule: str  # "daily" | "weekly" | "off"


# ── Routes ───────────────────────────────────────────
@router.get("/settings/{project_id}")
async def get_notification_settings(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(ProjectNotificationSetting)
        .where(ProjectNotificationSetting.project_id == project_id)
    )
    setting = result.scalar_one_or_none()
    if not setting:
        return {"project_id": project_id, "summary_schedule": "off"}
    return {
        "project_id": setting.project_id,
        "summary_schedule": setting.summary_schedule,
        "updated_at": str(setting.updated_at),
    }


@router.patch("/settings/{project_id}")
async def update_notification_settings(
    project_id: str,
    body: NotificationSettingUpdate,
    db: AsyncSession = Depends(get_db)
):
    # Verify project exists
    proj_r = await db.execute(select(Project).where(Project.id == project_id))
    if not proj_r.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="專案不存在")

    result = await db.execute(
        select(ProjectNotificationSetting)
        .where(ProjectNotificationSetting.project_id == project_id)
    )
    setting = result.scalar_one_or_none()
    if setting:
        setting.summary_schedule = body.summary_schedule
    else:
        setting = ProjectNotificationSetting(
            project_id=project_id,
            summary_schedule=body.summary_schedule,
        )
        db.add(setting)
    await db.commit()
    return {"success": True, "summary_schedule": body.summary_schedule}


@router.post("/summary/{project_id}")
async def trigger_summary(
    project_id: str,
    db: AsyncSession = Depends(get_db)
):
    # Verify project exists
    proj_r = await db.execute(select(Project).where(Project.id == project_id))
    project = proj_r.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="專案不存在")

    # Fetch tasks
    tasks_r = await db.execute(select(Task).where(Task.project_id == project_id))
    tasks = tasks_r.scalars().all()

    today_str = date.today().isoformat()
    total = len(tasks)
    done_tasks = [t for t in tasks if t.status == "done"]
    overdue_tasks = [
        t for t in tasks
        if t.due_date and t.due_date < today_str and t.status not in ("done", "archived")
    ]
    rate = int(len(done_tasks) / total * 100) if total > 0 else 0

    done_titles = ", ".join(t.title for t in done_tasks[-5:]) or "無"
    overdue_titles = ", ".join(t.title for t in overdue_tasks[:5]) or "無"

    prompt = (
        f"你是專案管理助手，請用繁體中文生成這個專案的進度摘要（不超過 150 字）：\n"
        f"專案：{project.name}\n"
        f"完成率：{rate}%\n"
        f"近期完成任務：{done_titles}\n"
        f"待處理逾期任務：{overdue_titles}"
    )

    summary_text = ""
    try:
        client = get_gemini_client()
        response = client.models.generate_content(
            model="gemini-2.0-flash",
            contents=prompt,
        )
        summary_text = response.text
    except Exception as e:
        summary_text = f"摘要生成失敗：{str(e)}"

    # Check push subscriptions
    subs_r = await db.execute(select(PushSubscription))
    subs = subs_r.scalars().all()

    # Log the notification
    log = NotificationLog(
        project_id=project_id,
        notification_type="summary",
        sent_date=today_str,
    )
    db.add(log)
    await db.commit()

    return {
        "project_id": project_id,
        "summary": summary_text,
        "push_sent": len(subs) > 0,
        "subscribers": len(subs),
    }


@router.get("/overdue")
async def get_overdue_tasks(db: AsyncSession = Depends(get_db)):
    today_str = date.today().isoformat()
    tasks_r = await db.execute(select(Task))
    all_tasks = tasks_r.scalars().all()

    overdue = [
        {
            "id": t.id,
            "project_id": t.project_id,
            "title": t.title,
            "status": t.status,
            "priority": t.priority,
            "due_date": t.due_date,
            "is_milestone": t.is_milestone,
        }
        for t in all_tasks
        if t.due_date and t.due_date < today_str and t.status not in ("done", "archived")
    ]
    return {"overdue": overdue, "count": len(overdue)}
