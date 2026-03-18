from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete
from pydantic import BaseModel
from typing import Optional
import json

from ..db.database import get_db
from ..db.models import Project, Message, File, Task

router = APIRouter(prefix="/projects", tags=["projects"])

# ── Schemas ──────────────────────────────────────────
class ProjectCreate(BaseModel):
    name: str
    description: str = ""
    tags: list[str] = []
    color: str = "#6366f1"

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    color: Optional[str] = None
    is_archived: Optional[bool] = None

# ── Routes ───────────────────────────────────────────
@router.get("/")
async def list_projects(
    archived: bool = False,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(Project)
        .where(Project.is_archived == archived)
        .order_by(Project.updated_at.desc())
    )
    projects = result.scalars().all()

    data = []
    for p in projects:
        # 計算各項目數量
        tasks_r = await db.execute(select(Task).where(Task.project_id == p.id))
        files_r = await db.execute(select(File).where(File.project_id == p.id))
        tasks_count = len(tasks_r.scalars().all())
        files_count = len(files_r.scalars().all())

        data.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "tags": json.loads(p.tags or "[]"),
            "color": p.color,
            "is_archived": p.is_archived,
            "tasks_count": tasks_count,
            "files_count": files_count,
            "created_at": str(p.created_at),
            "updated_at": str(p.updated_at),
        })
    return data

@router.post("/")
async def create_project(
    body: ProjectCreate,
    db: AsyncSession = Depends(get_db)
):
    project = Project(
        name=body.name,
        description=body.description,
        tags=json.dumps(body.tags, ensure_ascii=False),
        color=body.color
    )
    db.add(project)
    await db.commit()
    await db.refresh(project)
    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "tags": json.loads(project.tags or "[]"),
        "color": project.color,
        "is_archived": project.is_archived,
        "created_at": str(project.created_at),
    }

@router.get("/{project_id}")
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="專案不存在")

    return {
        "id": project.id,
        "name": project.name,
        "description": project.description,
        "tags": json.loads(project.tags or "[]"),
        "color": project.color,
        "is_archived": project.is_archived,
        "created_at": str(project.created_at),
        "updated_at": str(project.updated_at),
    }

@router.patch("/{project_id}")
async def update_project(
    project_id: str,
    body: ProjectUpdate,
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="專案不存在")

    if body.name is not None: project.name = body.name
    if body.description is not None: project.description = body.description
    if body.tags is not None: project.tags = json.dumps(body.tags, ensure_ascii=False)
    if body.color is not None: project.color = body.color
    if body.is_archived is not None: project.is_archived = body.is_archived

    await db.commit()
    return {"success": True}

@router.delete("/{project_id}")
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(status_code=404, detail="專案不存在")
    await db.delete(project)
    await db.commit()
    return {"success": True}
