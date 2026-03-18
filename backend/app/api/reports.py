from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import json

from ..db.database import get_db
from ..db.models import Project, Report, Task, Message, File
from ..core.gemini import generate_project_report

router = APIRouter(prefix="/reports", tags=["reports"])

REPORT_TYPES = ["progress", "meeting", "risk", "weekly"]

class ReportRequest(BaseModel):
    report_type: str
    extra_context: str = ""   # 額外補充（如會議原始紀錄）

@router.post("/{project_id}/generate")
async def generate_report(
    project_id: str,
    body: ReportRequest,
    db: AsyncSession = Depends(get_db)
):
    if body.report_type not in REPORT_TYPES:
        raise HTTPException(status_code=400, detail=f"不支援的報告類型，可用：{REPORT_TYPES}")

    proj = await db.execute(select(Project).where(Project.id == project_id))
    project = proj.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="專案不存在")

    # 彙整專案資訊作為上下文
    tasks_r = await db.execute(select(Task).where(Task.project_id == project_id))
    tasks = tasks_r.scalars().all()

    task_summary = "\n".join([
        f"- [{t.status.upper()}] {t.title} (優先級: {t.priority})"
        for t in tasks
    ])

    context = f"""
專案名稱：{project.name}
專案描述：{project.description}

任務清單：
{task_summary or '無任務'}

{f'額外資訊：{body.extra_context}' if body.extra_context else ''}
""".strip()

    content = await generate_project_report(
        project_name=project.name,
        report_type=body.report_type,
        context=context
    )

    # 儲存報告
    report = Report(
        project_id=project_id,
        title=f"{_report_name(body.report_type)} - {project.name}",
        report_type=body.report_type,
        content=content
    )
    db.add(report)
    await db.commit()
    await db.refresh(report)

    return {
        "id": report.id,
        "title": report.title,
        "content": content,
        "created_at": str(report.created_at),
    }

@router.get("/{project_id}")
async def list_reports(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(Report)
        .where(Report.project_id == project_id)
        .order_by(Report.created_at.desc())
    )
    reports = result.scalars().all()
    return [
        {
            "id": r.id,
            "title": r.title,
            "report_type": r.report_type,
            "content": r.content,
            "created_at": str(r.created_at),
        }
        for r in reports
    ]

@router.delete("/{report_id}")
async def delete_report(report_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Report).where(Report.id == report_id))
    report = result.scalar_one_or_none()
    if not report:
        raise HTTPException(status_code=404, detail="報告不存在")
    await db.delete(report)
    await db.commit()
    return {"success": True}

def _report_name(t: str) -> str:
    return {"progress": "進度報告", "meeting": "會議紀錄", "risk": "風險分析", "weekly": "週報"}.get(t, "報告")
