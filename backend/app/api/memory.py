"""
專案記憶 API
每個專案可以儲存 key-value 形式的記憶，讓 AI 在對話中持久化重要資訊
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete
from pydantic import BaseModel

from ..db.database import get_db
from ..db.models import ProjectMemory, Project

router = APIRouter(prefix="/projects", tags=["memory"])


class MemoryUpsert(BaseModel):
    key: str
    value: str


@router.get("/{project_id}/memory")
async def get_memories(project_id: str, db: AsyncSession = Depends(get_db)):
    """取得專案的所有記憶"""
    proj = await db.execute(select(Project).where(Project.id == project_id))
    if not proj.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="專案不存在")

    result = await db.execute(
        select(ProjectMemory)
        .where(ProjectMemory.project_id == project_id)
        .order_by(ProjectMemory.updated_at.desc())
    )
    memories = result.scalars().all()
    return [
        {
            "id": m.id,
            "key": m.key,
            "value": m.value,
            "created_at": str(m.created_at),
            "updated_at": str(m.updated_at),
        }
        for m in memories
    ]


@router.post("/{project_id}/memory")
async def upsert_memory(
    project_id: str,
    body: MemoryUpsert,
    db: AsyncSession = Depends(get_db)
):
    """新增或更新記憶（同一 key 覆寫）"""
    proj = await db.execute(select(Project).where(Project.id == project_id))
    if not proj.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="專案不存在")

    # 查找現有的記憶
    existing = await db.execute(
        select(ProjectMemory).where(
            ProjectMemory.project_id == project_id,
            ProjectMemory.key == body.key
        )
    )
    mem = existing.scalar_one_or_none()

    if mem:
        mem.value = body.value
        from datetime import datetime
        mem.updated_at = datetime.utcnow()
        await db.commit()
        return {"id": mem.id, "key": mem.key, "action": "updated"}
    else:
        new_mem = ProjectMemory(
            project_id=project_id,
            key=body.key,
            value=body.value
        )
        db.add(new_mem)
        await db.commit()
        await db.refresh(new_mem)
        return {"id": new_mem.id, "key": new_mem.key, "action": "created"}


@router.delete("/{project_id}/memory/{key}")
async def delete_memory(
    project_id: str,
    key: str,
    db: AsyncSession = Depends(get_db)
):
    """刪除特定 key 的記憶"""
    result = await db.execute(
        select(ProjectMemory).where(
            ProjectMemory.project_id == project_id,
            ProjectMemory.key == key
        )
    )
    mem = result.scalar_one_or_none()
    if not mem:
        raise HTTPException(status_code=404, detail="記憶不存在")

    await db.delete(mem)
    await db.commit()
    return {"success": True, "deleted_key": key}


@router.delete("/{project_id}/memory")
async def clear_memories(project_id: str, db: AsyncSession = Depends(get_db)):
    """清除專案的所有記憶"""
    proj = await db.execute(select(Project).where(Project.id == project_id))
    if not proj.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="專案不存在")

    await db.execute(
        delete(ProjectMemory).where(ProjectMemory.project_id == project_id)
    )
    await db.commit()
    return {"success": True}
