"""
APScheduler 定時通知模組
每小時檢查逾期任務並發送 Web Push 通知
"""
import logging
from datetime import datetime, date
from typing import Optional

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .db.database import AsyncSessionLocal
from .db.models import (
    Task,
    Project,
    PushSubscription,
    ProjectNotificationSetting,
    NotificationLog,
)

logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler()


async def send_web_push(subscription: PushSubscription, message: str) -> bool:
    """發送 Web Push 通知，失敗不影響主流程"""
    try:
        from pywebpush import webpush, WebPushException
        import json
        import os

        vapid_private_key = os.getenv("VAPID_PRIVATE_KEY", "")
        vapid_claims = {
            "sub": os.getenv("VAPID_SUBJECT", "mailto:admin@example.com")
        }

        if not vapid_private_key:
            logger.warning("VAPID_PRIVATE_KEY 未設定，跳過 Web Push")
            return False

        webpush(
            subscription_info={
                "endpoint": subscription.endpoint,
                "keys": {
                    "p256dh": subscription.p256dh,
                    "auth": subscription.auth,
                },
            },
            data=json.dumps({"title": "任務逾期通知", "body": message}),
            vapid_private_key=vapid_private_key,
            vapid_claims=vapid_claims,
        )
        return True
    except ImportError:
        logger.warning("pywebpush 未安裝，跳過 Web Push")
        return False
    except Exception as exc:
        logger.error("Web Push 失敗: %s", exc)
        return False


async def check_overdue_tasks() -> None:
    """每小時執行：查詢逾期任務並發送通知"""
    logger.info("🔔 開始檢查逾期任務...")
    today_str = date.today().isoformat()  # YYYY-MM-DD

    async with AsyncSessionLocal() as db:
        try:
            await _process_overdue(db, today_str)
        except Exception as exc:
            logger.error("check_overdue_tasks 發生錯誤: %s", exc)


async def _process_overdue(db: AsyncSession, today_str: str) -> None:
    now_str = datetime.utcnow().strftime("%Y-%m-%d")

    # 1. 查詢所有 in_progress 且 due_date < today 的 Task
    tasks_result = await db.execute(
        select(Task).where(
            Task.status == "in_progress",
            Task.due_date != "",
            Task.due_date < now_str,
        )
    )
    overdue_tasks: list[Task] = list(tasks_result.scalars().all())

    if not overdue_tasks:
        logger.info("✅ 無逾期任務")
        return

    logger.info("⚠️  發現 %d 個逾期任務", len(overdue_tasks))

    # 以 project_id 分組
    project_tasks: dict[str, list[Task]] = {}
    for task in overdue_tasks:
        project_tasks.setdefault(task.project_id, []).append(task)

    # 2. 逐一處理各專案
    for project_id, tasks in project_tasks.items():
        try:
            await _notify_project(db, project_id, tasks, today_str)
        except Exception as exc:
            logger.error("處理專案 %s 通知失敗: %s", project_id, exc)

    await db.commit()


async def _notify_project(
    db: AsyncSession,
    project_id: str,
    tasks: list[Task],
    today_str: str,
) -> None:
    # 檢查通知設定（summary_schedule != "off" 代表啟用）
    setting_result = await db.execute(
        select(ProjectNotificationSetting).where(
            ProjectNotificationSetting.project_id == project_id
        )
    )
    setting: Optional[ProjectNotificationSetting] = setting_result.scalar_one_or_none()

    if setting is None or setting.summary_schedule == "off":
        return  # 未啟用通知

    # 檢查今日是否已通知（避免重複）
    log_result = await db.execute(
        select(NotificationLog).where(
            NotificationLog.project_id == project_id,
            NotificationLog.notification_type == "overdue",
            NotificationLog.sent_date == today_str,
        )
    )
    if log_result.scalar_one_or_none():
        logger.info("專案 %s 今日已通知，略過", project_id)
        return

    # 建立 NotificationLog
    message = f"{len(tasks)} tasks overdue"
    log_entry = NotificationLog(
        project_id=project_id,
        task_id=tasks[0].id if len(tasks) == 1 else None,
        notification_type="overdue",
        sent_date=today_str,
    )
    db.add(log_entry)

    logger.info("📬 專案 %s：%s", project_id, message)

    # 3. 發送 Web Push（若有訂閱）
    subs_result = await db.execute(select(PushSubscription))
    subscriptions: list[PushSubscription] = list(subs_result.scalars().all())

    for sub in subscriptions:
        await send_web_push(sub, message)


async def check_milestone_completions() -> None:
    """每小時執行：偵測剛完成的 milestone 任務並發送通知"""
    logger.info("🏁 開始檢查 milestone 完成狀態...")
    async with AsyncSessionLocal() as db:
        try:
            await _process_milestone_completions(db)
        except Exception as exc:
            logger.error("check_milestone_completions 發生錯誤: %s", exc)


async def _process_milestone_completions(db: AsyncSession) -> None:
    today_str = date.today().isoformat()

    # 查詢所有 is_milestone=True 且 status=done 的任務
    result = await db.execute(
        select(Task).where(
            Task.is_milestone == True,
            Task.status == "done",
        )
    )
    milestones: list[Task] = list(result.scalars().all())

    if not milestones:
        logger.info("✅ 無已完成的 milestone")
        return

    for task in milestones:
        # 避免重複通知：檢查今日是否已有 milestone 通知
        log_result = await db.execute(
            select(NotificationLog).where(
                NotificationLog.project_id == task.project_id,
                NotificationLog.task_id == task.id,
                NotificationLog.notification_type == "milestone",
                NotificationLog.sent_date == today_str,
            )
        )
        if log_result.scalar_one_or_none():
            continue

        message = f"🏁 Milestone 完成：{task.title}"
        logger.info("📬 %s (project=%s)", message, task.project_id)

        # 寫入通知記錄
        log_entry = NotificationLog(
            project_id=task.project_id,
            task_id=task.id,
            notification_type="milestone",
            sent_date=today_str,
        )
        db.add(log_entry)

        # 發送 Web Push
        subs_result = await db.execute(select(PushSubscription))
        for sub in subs_result.scalars().all():
            await send_web_push(sub, message)

    await db.commit()


def start_scheduler() -> None:
    """啟動排程器"""
    scheduler.add_job(
        check_overdue_tasks,
        trigger="interval",
        hours=1,
        id="check_overdue_tasks",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.add_job(
        check_milestone_completions,
        trigger="interval",
        hours=1,
        id="check_milestone_completions",
        replace_existing=True,
        max_instances=1,
    )
    scheduler.start()
    logger.info("✅ APScheduler 已啟動（每小時檢查逾期任務 + milestone 完成）")


def stop_scheduler() -> None:
    """停止排程器"""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("⏹ APScheduler 已停止")
