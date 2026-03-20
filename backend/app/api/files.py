from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, BackgroundTasks, Form, Body
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import os, aiofiles, uuid, mimetypes, asyncio, logging
from typing import Optional

from ..db.database import get_db
from ..db.models import File as FileModel, Project
from ..core.gemini import upload_file_to_gemini, generate_file_summary

router = APIRouter(prefix="/files", tags=["files"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = "./data/uploads"
ALLOWED_TYPES = {
    "application/pdf": "pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "application/vnd.ms-powerpoint": "pptx",
    "text/plain": "txt",
    "text/markdown": "txt",
    "image/jpeg": "image",
    "image/png": "image",
    "image/webp": "image",
}

os.makedirs(UPLOAD_DIR, exist_ok=True)


@router.get("/{project_id}/folders")
async def list_folders(project_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(FileModel.folder_path).where(FileModel.project_id == project_id).distinct()
    )
    paths = sorted(set(row[0] or "/" for row in result.fetchall()))
    folders = list(paths)
    for path in paths:
        if path == "/":
            continue
        parts = path.rstrip("/").split("/")
        for i in range(1, len(parts)):
            parent = "/".join(parts[:i]) or "/"
            if parent not in folders:
                folders.append(parent)
    return {"folders": sorted(set(folders))}


@router.get("/{project_id}")
async def list_files(
    project_id: str,
    folder: Optional[str] = None,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    query = select(FileModel).where(FileModel.project_id == project_id)
    if folder is not None:
        query = query.where(FileModel.folder_path == folder)
    query = query.order_by(FileModel.created_at.desc())

    result = await db.execute(query)
    files = result.scalars().all()
    return [
        {
            "id": f.id,
            "original_name": f.original_name,
            "file_type": f.file_type,
            "file_size": f.file_size,
            "summary": f.summary,
            "is_indexed": f.is_indexed,
            "folder_path": f.folder_path or "/",
            "created_at": f.created_at.isoformat(),
        }
        for f in files
    ]


@router.post("/upload/{project_id}")
async def upload_file(
    project_id: str,
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    folder: str = Form(default="/"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    if file.filename and (file.filename.endswith(".md") or file.filename.endswith(".txt")):
        content_type = "text/plain"
    if file.filename and file.filename.endswith(".pptx"):
        content_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Unsupported file type: {content_type}")

    file_id = str(uuid.uuid4())
    ext = os.path.splitext(file.filename or "")[1]
    filename = f"{file_id}{ext}"
    local_path = os.path.join(UPLOAD_DIR, filename)

    content = await file.read()
    async with aiofiles.open(local_path, "wb") as f:
        await f.write(content)

    db_file = FileModel(
        id=file_id,
        project_id=project_id,
        filename=filename,
        original_name=file.filename or filename,
        file_type=ALLOWED_TYPES.get(content_type, "unknown"),
        file_size=len(content),
        folder_path=folder or "/",
        is_indexed=False,
    )
    db.add(db_file)
    await db.commit()

    background_tasks.add_task(
        _process_file_background,
        file_id,
        local_path,
        content_type,
        file.filename or filename,
    )

    return {
        "id": file_id,
        "original_name": file.filename,
        "file_type": ALLOWED_TYPES.get(content_type, "unknown"),
        "file_size": len(content),
        "is_indexed": False,
        "folder_path": folder or "/",
        "created_at": db_file.created_at.isoformat(),
    }


@router.patch("/{file_id}/move")
async def move_file(
    file_id: str,
    folder: str = Body(..., embed=True),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(FileModel).where(FileModel.id == file_id))
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(404, "File not found")
    f.folder_path = folder or "/"
    await db.commit()
    return {"id": file_id, "folder_path": f.folder_path}


@router.delete("/{file_id}")
async def delete_file(file_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(FileModel).where(FileModel.id == file_id))
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(404, "File not found")
    local_path = os.path.join(UPLOAD_DIR, f.filename)
    if os.path.exists(local_path):
        os.remove(local_path)
    await db.delete(f)
    await db.commit()
    return {"ok": True}


async def _process_file_background(file_id: str, local_path: str, mime_type: str, display_name: str):
    from ..db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(select(FileModel).where(FileModel.id == file_id))
            f = result.scalar_one_or_none()
            if not f:
                return

            gemini_uri = None
            summary = ""

            try:
                gemini_uri = await upload_file_to_gemini(local_path, mime_type, display_name)
            except Exception as e:
                logger.warning(f"Gemini upload failed: {e}")

            try:
                if gemini_uri:
                    summary = await generate_file_summary(gemini_uri, display_name)
                else:
                    summary = await _generate_summary_from_local(local_path, mime_type, display_name)
            except Exception as e:
                logger.warning(f"Summary failed: {e}")
                summary = f"\u6a94\u6848 {display_name} \u5df2\u4e0a\u50b3\u3002"

            f.gemini_file_uri = gemini_uri
            f.summary = summary
            f.is_indexed = True
            await db.commit()

        except Exception as e:
            logger.error(f"Background processing error: {e}")
            try:
                result = await db.execute(select(FileModel).where(FileModel.id == file_id))
                f = result.scalar_one_or_none()
                if f:
                    f.summary = "\u8655\u7406\u5931\u6557\uff0c\u8acb\u91cd\u65b0\u4e0a\u50b3"
                    f.is_indexed = True
                    await db.commit()
            except Exception:
                pass


async def _generate_summary_from_local(local_path: str, mime_type: str, display_name: str) -> str:
    from ..core.gemini import generate_text
    text = ""
    try:
        if mime_type == "application/pdf":
            import pdfplumber
            with pdfplumber.open(local_path) as pdf:
                text = "\n".join(p.extract_text() or "" for p in pdf.pages[:5])
        elif "word" in mime_type:
            from docx import Document
            doc = Document(local_path)
            text = "\n".join(p.text for p in doc.paragraphs[:50])
        elif "presentationml" in mime_type or "powerpoint" in mime_type:
            from pptx import Presentation
            prs = Presentation(local_path)
            slides_text = []
            for i, slide in enumerate(prs.slides[:10]):
                slide_lines = []
                for shape in slide.shapes:
                    if hasattr(shape, "text") and shape.text.strip():
                        slide_lines.append(shape.text.strip())
                if slide_lines:
                    slides_text.append(f"\u7b2c{i+1}\u9801: " + " | ".join(slide_lines))
            text = "\n".join(slides_text)
        elif mime_type in ("text/plain", "text/markdown"):
            async with aiofiles.open(local_path, "r", encoding="utf-8", errors="ignore") as f:
                text = await f.read()
            text = text[:3000]
    except Exception:
        return f"\u6a94\u6848 {display_name} \u5df2\u4e0a\u50b3\u81f3\u77e5\u8b58\u5eab\u3002"

    if not text.strip():
        return f"\u6a94\u6848 {display_name} \u5167\u5bb9\u70ba\u7a7a\u6216\u7121\u6cd5\u8b80\u53d6\u3002"

    prompt = f"\u8acb\u7528\u7e41\u9ad4\u4e2d\u6587\u70ba\u4ee5\u4e0b\u6587\u4ef6\u751f\u6210\u6458\u8981\uff08200\u5b57\u4ee5\u5167\uff09\uff1a\n\n{text[:2000]}"
    return await generate_text(prompt)
