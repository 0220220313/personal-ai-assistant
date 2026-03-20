from fastapi import APIRouter, Depends, UploadFile, File as UploadFileType, HTTPException, BackgroundTasks, Form, Body
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import os, aiofiles, uuid, mimetypes, asyncio, logging
from typing import Optional

from ..db.database import get_db
from ..db.models import File, Project
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
        select(File.folder_path).where(File.project_id == project_id).distinct()
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

    query = select(File).where(File.project_id == project_id)
    if folder is not None:
        query = query.where(File.folder_path == folder)
    query = query.order_by(File.created_at.desc())

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
    file: UploadFileType = UploadFileType(...),
    folder: str = Form(default="/"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    project = result.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")

    content_type = file.content_type or mimetypes.guess_type(file.filename or "")[0] or ""
    fname = file.filename or ""
    if fname.endswith(".md"):
        content_type = "text/plain"
    elif fname.endswith(".pptx"):
        content_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    elif fname.endswith(".ppt"):
        content_type = "application/vnd.ms-powerpoint"

    if content_type not in ALLOWED_TYPES:
        raise HTTPException(400, f"Unsupported file type: {content_type}")

    file_id = str(uuid.uuid4())
    ext = os.path.splitext(fname)[1]
    filename = f"{file_id}{ext}"
    local_path = os.path.join(UPLOAD_DIR, filename)

    content = await file.read()
    async with aiofiles.open(local_path, "wb") as f:
        await f.write(content)

    db_file = File(
        id=file_id,
        project_id=project_id,
        filename=filename,
        original_name=fname or filename,
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
        fname or filename,
    )

    return {
        "id": file_id,
        "original_name": fname,
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
    result = await db.execute(select(File).where(File.id == file_id))
    f = result.scalar_one_or_none()
    if not f:
        raise HTTPException(404, "File not found")
    f.folder_path = folder or "/"
    await db.commit()
    return {"id": file_id, "folder_path": f.folder_path}


@router.delete("/{file_id}")
async def delete_file(file_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(File).where(File.id == file_id))
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
            result = await db.execute(select(File).where(File.id == file_id))
            f = result.scalar_one_or_none()
            if not f:
                return

            gemini_uri = None
            summary = ""

            try:
                gemini_uri = await upload_file_to_gemini(local_path, mime_type, display_name)
                logger.info(f"Gemini upload OK: {gemini_uri}")
            except Exception as e:
                logger.warning(f"Gemini upload failed: {e}")

            try:
                if gemini_uri:
                    summary = await generate_file_summary(gemini_uri, display_name)
                else:
                    summary = await _generate_summary_from_local(local_path, mime_type, display_name)
            except Exception as e:
                logger.warning(f"Summary generation failed: {e}")
                summary = f"檔案 {display_name} 已上傳，摘要生成失敗。"

            f.gemini_file_uri = gemini_uri
            f.summary = summary
            f.is_indexed = True
            await db.commit()
            logger.info(f"File {file_id} indexed OK")

        except Exception as e:
            logger.error(f"Background processing error: {e}")
            try:
                result = await db.execute(select(File).where(File.id == file_id))
                f = result.scalar_one_or_none()
                if f:
                    f.summary = "處理失敗，請重新上傳"
                    f.is_indexed = True
                    await db.commit()
            except Exception:
                pass


async def _generate_summary_from_local(local_path: str, mime_type: str, display_name: str) -> str:
    from ..core.gemini import generate_text
    text = ""
    try:
        if mime_type == "application/pdf":
            try:
                import pdfplumber
                with pdfplumber.open(local_path) as pdf:
                    text = "\n".join(p.extract_text() or "" for p in pdf.pages[:5])
            except ImportError:
                import PyPDF2
                with open(local_path, "rb") as f:
                    reader = PyPDF2.PdfReader(f)
                    text = "\n".join(page.extract_text() or "" for page in reader.pages[:5])
        elif "wordprocessingml" in mime_type:
            from docx import Document
            doc = Document(local_path)
            text = "\n".join(p.text for p in doc.paragraphs[:50])
        elif "spreadsheetml" in mime_type:
            import openpyxl
            wb = openpyxl.load_workbook(local_path, read_only=True, data_only=True)
            rows = []
            for ws in list(wb.worksheets)[:2]:
                for row in list(ws.iter_rows(values_only=True))[:20]:
                    rows.append("\t".join(str(c) if c is not None else "" for c in row))
            text = "\n".join(rows)
        elif "presentationml" in mime_type or "powerpoint" in mime_type:
            from pptx import Presentation
            prs = Presentation(local_path)
            slides_text = []
            for i, slide in enumerate(prs.slides[:15]):
                slide_parts = []
                for shape in slide.shapes:
                    if hasattr(shape, "text") and shape.text.strip():
                        slide_parts.append(shape.text.strip())
                if slide_parts:
                    slides_text.append(f"第{i+1}頁: " + " | ".join(slide_parts))
            text = "\n".join(slides_text)
        elif mime_type in ("text/plain", "text/markdown"):
            async with aiofiles.open(local_path, "r", encoding="utf-8", errors="ignore") as f:
                text = await f.read()
            text = text[:4000]
    except Exception as e:
        logger.warning(f"Local extraction failed for {display_name}: {e}")
        return f"檔案 {display_name} 已上傳至知識庫。"

    if not text.strip():
        return f"檔案 {display_name} 內容為空或無法讀取。"

    prompt = f"請用繁體中文為以下文件內容生成摘要（200字以內），說明主要內容與重點：\n\n{text[:3000]}"
    return await generate_text(prompt)
