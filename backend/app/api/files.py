from fastapi import APIRouter, Depends, UploadFile, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import os, aiofiles, uuid, mimetypes

from ..db.database import get_db
from ..db.models import File, Project
from ..core.gemini import upload_file_to_gemini, generate_file_summary

router = APIRouter(prefix="/files", tags=["files"])

UPLOAD_DIR = "./data/uploads"
ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "text/plain": "txt",
    "image/jpeg": "image",
    "image/png": "image",
    "image/webp": "image",
}

os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload/{project_id}")
async def upload_file(
    project_id: str,
    file: UploadFile,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db)
):
    # 確認專案
    proj = await db.execute(select(Project).where(Project.id == project_id))
    if not proj.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="專案不存在")

    # 驗證檔案類型
    content_type = file.content_type or mimetypes.guess_type(file.filename)[0] or ""
    file_type = ALLOWED_TYPES.get(content_type)
    if not file_type:
        raise HTTPException(status_code=400, detail=f"不支援的檔案類型: {content_type}")

    # 儲存到本地
    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    local_filename = f"{file_id}{ext}"
    local_path = os.path.join(UPLOAD_DIR, local_filename)

    content = await file.read()
    async with aiofiles.open(local_path, "wb") as f:
        await f.write(content)

    # 建立資料庫記錄
    db_file = File(
        id=file_id,
        project_id=project_id,
        filename=local_filename,
        original_name=file.filename,
        file_type=file_type,
        file_size=len(content),
    )
    db.add(db_file)
    await db.commit()

    # 背景任務：上傳到 Gemini + 生成摘要
    background_tasks.add_task(
        _process_file_background, file_id, local_path, content_type, file.filename, db
    )

    return {
        "id": file_id,
        "filename": file.filename,
        "file_type": file_type,
        "file_size": len(content),
        "status": "processing",
    }

async def _process_file_background(
    file_id: str, local_path: str, mime_type: str, display_name: str, db: AsyncSession
):
    """背景：上傳 Gemini + 生成摘要"""
    from ..db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        try:
            # 上傳到 Gemini File API
            result = await upload_file_to_gemini(local_path, mime_type, display_name)
            gemini_uri = result["uri"]

            # 取得 Gemini file 物件並生成摘要
            file_part = {"file_data": {"mime_type": mime_type, "file_uri": gemini_uri}}
            summary = await generate_file_summary(file_part, display_name)

            # 更新資料庫
            r = await session.execute(select(File).where(File.id == file_id))
            db_file = r.scalar_one_or_none()
            if db_file:
                db_file.gemini_file_uri = gemini_uri
                db_file.summary = summary
                db_file.is_indexed = True
                await session.commit()
        except Exception as e:
            print(f"[File Processing Error] {file_id}: {e}")

@router.get("/{project_id}")
async def list_files(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(File)
        .where(File.project_id == project_id)
        .order_by(File.created_at.desc())
    )
    files = result.scalars().all()
    return [
        {
            "id": f.id,
            "original_name": f.original_name,
            "file_type": f.file_type,
            "file_size": f.file_size,
            "summary": f.summary,
            "is_indexed": f.is_indexed,
            "created_at": str(f.created_at),
        }
        for f in files
    ]

@router.delete("/{file_id}")
async def delete_file(file_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(File).where(File.id == file_id))
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(status_code=404, detail="檔案不存在")

    # 刪除本地檔案
    local_path = os.path.join(UPLOAD_DIR, f.filename)
    if os.path.exists(local_path):
        os.remove(local_path)

    await db.delete(f)
    await db.commit()
    return {"success": True}
