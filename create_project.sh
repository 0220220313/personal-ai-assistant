#!/bin/bash
# 在您的 WSL 中執行這個腳本，會自動建立所有專案檔案
set -e

TARGET="$HOME/personal-ai-assistant"
echo "📁 建立專案於 $TARGET ..."
mkdir -p "$TARGET"/{backend/app/{api,core,db},frontend/{app/{projects/\[id\]/{chat,knowledge,tasks,reports},command},components/{ui,layout},lib,public/icons},agent/tools}

cd "$TARGET"

# ════════════════════════════════════════
# BACKEND FILES
# ════════════════════════════════════════

cat > backend/requirements.txt << 'PYEOF'
fastapi==0.115.0
uvicorn[standard]==0.30.0
sqlalchemy==2.0.35
aiosqlite==0.20.0
google-generativeai==0.8.3
chromadb==0.5.18
python-multipart==0.0.12
python-dotenv==1.0.1
websockets==13.1
pydantic==2.9.2
pydantic-settings==2.5.2
httpx==0.27.2
aiofiles==24.1.0
PYEOF

cat > backend/.env.example << 'PYEOF'
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.0-flash
GEMINI_PRO_MODEL=gemini-1.5-pro
DATABASE_URL=sqlite+aiosqlite:///./data/assistant.db
BACKEND_URL=http://localhost:8000
FRONTEND_URL=http://localhost:3000
AGENT_SECRET_TOKEN=change_this_secret_token
PYEOF

touch backend/app/__init__.py
touch backend/app/api/__init__.py
touch backend/app/core/__init__.py
touch backend/app/db/__init__.py

cat > backend/app/db/database.py << 'PYEOF'
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
import os

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./data/assistant.db")
engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = async_sessionmaker(engine, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

async def get_db():
    async with AsyncSessionLocal() as session:
        try:
            yield session
        finally:
            await session.close()

async def init_db():
    os.makedirs("./data", exist_ok=True)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
PYEOF

cat > backend/app/db/models.py << 'PYEOF'
from sqlalchemy import String, Text, DateTime, Boolean, Integer, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func
from .database import Base
import uuid

def gen_uuid(): return str(uuid.uuid4())

class Project(Base):
    __tablename__ = "projects"
    id:          Mapped[str]  = mapped_column(String, primary_key=True, default=gen_uuid)
    name:        Mapped[str]  = mapped_column(String(200))
    description: Mapped[str]  = mapped_column(Text, default="")
    tags:        Mapped[str]  = mapped_column(Text, default="[]")
    color:       Mapped[str]  = mapped_column(String(20), default="#6366f1")
    is_archived: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at:  Mapped[str]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:  Mapped[str]  = mapped_column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
    messages: Mapped[list["Message"]] = relationship("Message", back_populates="project", cascade="all, delete-orphan")
    files:    Mapped[list["File"]]    = relationship("File",    back_populates="project", cascade="all, delete-orphan")
    tasks:    Mapped[list["Task"]]    = relationship("Task",    back_populates="project", cascade="all, delete-orphan")
    reports:  Mapped[list["Report"]]  = relationship("Report",  back_populates="project", cascade="all, delete-orphan")

class Message(Base):
    __tablename__ = "messages"
    id:         Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    project_id: Mapped[str] = mapped_column(String, ForeignKey("projects.id"))
    role:       Mapped[str] = mapped_column(String(20))
    content:    Mapped[str] = mapped_column(Text)
    file_refs:  Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    project: Mapped["Project"] = relationship("Project", back_populates="messages")

class File(Base):
    __tablename__ = "files"
    id:              Mapped[str]  = mapped_column(String, primary_key=True, default=gen_uuid)
    project_id:      Mapped[str]  = mapped_column(String, ForeignKey("projects.id"))
    filename:        Mapped[str]  = mapped_column(String(500))
    original_name:   Mapped[str]  = mapped_column(String(500))
    file_type:       Mapped[str]  = mapped_column(String(50))
    file_size:       Mapped[int]  = mapped_column(Integer, default=0)
    gemini_file_uri: Mapped[str]  = mapped_column(Text, default="")
    summary:         Mapped[str]  = mapped_column(Text, default="")
    is_indexed:      Mapped[bool] = mapped_column(Boolean, default=False)
    created_at:      Mapped[str]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    project: Mapped["Project"] = relationship("Project", back_populates="files")

class Task(Base):
    __tablename__ = "tasks"
    id:          Mapped[str]  = mapped_column(String, primary_key=True, default=gen_uuid)
    project_id:  Mapped[str]  = mapped_column(String, ForeignKey("projects.id"))
    title:       Mapped[str]  = mapped_column(String(500))
    description: Mapped[str]  = mapped_column(Text, default="")
    status:      Mapped[str]  = mapped_column(String(30), default="todo")
    priority:    Mapped[str]  = mapped_column(String(10), default="medium")
    assignee:    Mapped[str]  = mapped_column(String(100), default="")
    due_date:    Mapped[str]  = mapped_column(String(30), default="")
    source_msg:  Mapped[str]  = mapped_column(String, default="")
    created_at:  Mapped[str]  = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at:  Mapped[str]  = mapped_column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())
    project: Mapped["Project"] = relationship("Project", back_populates="tasks")

class Report(Base):
    __tablename__ = "reports"
    id:          Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    project_id:  Mapped[str] = mapped_column(String, ForeignKey("projects.id"))
    title:       Mapped[str] = mapped_column(String(500))
    report_type: Mapped[str] = mapped_column(String(50))
    content:     Mapped[str] = mapped_column(Text)
    created_at:  Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    project: Mapped["Project"] = relationship("Project", back_populates="reports")

class AgentCommand(Base):
    __tablename__ = "agent_commands"
    id:         Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    command:    Mapped[str] = mapped_column(Text)
    status:     Mapped[str] = mapped_column(String(20), default="pending")
    result:     Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[str] = mapped_column(DateTime(timezone=True), onupdate=func.now(), server_default=func.now())

class PushSubscription(Base):
    __tablename__ = "push_subscriptions"
    id:        Mapped[str] = mapped_column(String, primary_key=True, default=gen_uuid)
    endpoint:  Mapped[str] = mapped_column(Text, unique=True)
    p256dh:    Mapped[str] = mapped_column(Text)
    auth:      Mapped[str] = mapped_column(Text)
    created_at: Mapped[str] = mapped_column(DateTime(timezone=True), server_default=func.now())
PYEOF

cat > backend/app/core/gemini.py << 'PYEOF'
import os, json, asyncio, re
from typing import AsyncIterator
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

def init_gemini():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY 未設定")
    genai.configure(api_key=api_key)

SAFETY = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
}

SYSTEM_PROMPT = """你是一個全能的個人 AI 助理。協助用戶管理專案、追蹤任務、分析文件、生成報告。
回答時請使用繁體中文，適當使用 Markdown 格式，引用文件時標明 [來源: 文件名稱]。"""

async def stream_chat(messages, system_prompt=SYSTEM_PROMPT, model_name=None, files=None):
    model_name = model_name or os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    model = genai.GenerativeModel(model_name, system_instruction=system_prompt, safety_settings=SAFETY)
    history = messages[:-1] if len(messages) > 1 else []
    last = messages[-1] if messages else None
    if not last: return
    chat = model.start_chat(history=history)
    parts = []
    if files: parts.extend(files)
    if isinstance(last.get("parts"), list): parts.extend(last["parts"])
    else: parts.append(last.get("parts", ""))
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, lambda: chat.send_message(parts, stream=True))
    for chunk in response:
        if chunk.text: yield chunk.text

async def generate_text(prompt, context="", model_name=None, files=None):
    model_name = model_name or os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    model = genai.GenerativeModel(model_name, system_instruction=SYSTEM_PROMPT, safety_settings=SAFETY)
    parts = []
    if files: parts.extend(files)
    if context: parts.append(f"背景：\n{context}\n\n")
    parts.append(prompt)
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(None, lambda: model.generate_content(parts))
    return response.text

async def upload_file_to_gemini(file_path, mime_type, display_name=None):
    import time
    loop = asyncio.get_event_loop()
    def _upload():
        f = genai.upload_file(path=file_path, mime_type=mime_type, display_name=display_name or os.path.basename(file_path))
        while f.state.name == "PROCESSING":
            time.sleep(2)
            f = genai.get_file(f.name)
        return f
    file_obj = await loop.run_in_executor(None, _upload)
    return {"uri": file_obj.uri, "name": file_obj.name, "mime_type": file_obj.mime_type}

async def generate_file_summary(file_obj, filename):
    prompt = f"請分析「{filename}」，用繁體中文生成：1. 文件摘要（3-5句）2. 主要重點（條列式）3. 關鍵詞（5-10個）"
    return await generate_text(prompt, files=[file_obj], model_name=os.getenv("GEMINI_PRO_MODEL", "gemini-1.5-pro"))

async def extract_tasks_from_text(text):
    prompt = f"""從以下文字提取任務，以JSON格式回傳：
```json
[{{"title":"","description":"","priority":"high/medium/low","due_date":""}}]
```
文字：{text}
只回傳JSON，不要其他文字。"""
    result = await generate_text(prompt)
    try:
        m = re.search(r'```json\s*([\s\S]*?)\s*```', result)
        return json.loads(m.group(1) if m else result.strip())
    except: return []

async def generate_project_report(project_name, report_type, context, files=None):
    prompts = {
        "progress": f"為專案「{project_name}」生成進度報告，包含：完成項目、進行中、待辦、風險評估。",
        "meeting": "整理會議內容，生成會議紀錄：出席者、討論重點、決議、後續行動。",
        "risk": f"分析專案「{project_name}」潛在風險，提供風險等級與對策。",
        "weekly": f"為專案「{project_name}」生成週報：本週完成、下週計畫、需協助事項。",
    }
    return await generate_text(f"{prompts.get(report_type,'')}\n\n{context}", files=files,
                               model_name=os.getenv("GEMINI_PRO_MODEL", "gemini-1.5-pro"))
PYEOF

cat > backend/app/api/projects.py << 'PYEOF'
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
import json
from ..db.database import get_db
from ..db.models import Project, Task, File

router = APIRouter(prefix="/projects", tags=["projects"])

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

@router.get("/")
async def list_projects(archived: bool = False, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Project).where(Project.is_archived == archived).order_by(Project.updated_at.desc()))
    projects = result.scalars().all()
    data = []
    for p in projects:
        t = await db.execute(select(Task).where(Task.project_id == p.id))
        f = await db.execute(select(File).where(File.project_id == p.id))
        data.append({"id":p.id,"name":p.name,"description":p.description,"tags":json.loads(p.tags or "[]"),
                     "color":p.color,"is_archived":p.is_archived,"tasks_count":len(t.scalars().all()),
                     "files_count":len(f.scalars().all()),"created_at":str(p.created_at),"updated_at":str(p.updated_at)})
    return data

@router.post("/")
async def create_project(body: ProjectCreate, db: AsyncSession = Depends(get_db)):
    p = Project(name=body.name, description=body.description, tags=json.dumps(body.tags, ensure_ascii=False), color=body.color)
    db.add(p); await db.commit(); await db.refresh(p)
    return {"id":p.id,"name":p.name,"description":p.description,"tags":json.loads(p.tags or "[]"),"color":p.color,"is_archived":p.is_archived,"created_at":str(p.created_at)}

@router.get("/{project_id}")
async def get_project(project_id: str, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Project).where(Project.id == project_id))
    p = r.scalar_one_or_none()
    if not p: raise HTTPException(404, "專案不存在")
    return {"id":p.id,"name":p.name,"description":p.description,"tags":json.loads(p.tags or "[]"),"color":p.color,"is_archived":p.is_archived,"created_at":str(p.created_at),"updated_at":str(p.updated_at)}

@router.patch("/{project_id}")
async def update_project(project_id: str, body: ProjectUpdate, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Project).where(Project.id == project_id))
    p = r.scalar_one_or_none()
    if not p: raise HTTPException(404, "專案不存在")
    if body.name is not None: p.name = body.name
    if body.description is not None: p.description = body.description
    if body.tags is not None: p.tags = json.dumps(body.tags, ensure_ascii=False)
    if body.color is not None: p.color = body.color
    if body.is_archived is not None: p.is_archived = body.is_archived
    await db.commit(); return {"success": True}

@router.delete("/{project_id}")
async def delete_project(project_id: str, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Project).where(Project.id == project_id))
    p = r.scalar_one_or_none()
    if not p: raise HTTPException(404, "專案不存在")
    await db.delete(p); await db.commit(); return {"success": True}
PYEOF

cat > backend/app/api/chat.py << 'PYEOF'
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import json
from ..db.database import get_db
from ..db.models import Project, Message, File
from ..core.gemini import stream_chat, extract_tasks_from_text

router = APIRouter(prefix="/chat", tags=["chat"])

class ChatRequest(BaseModel):
    project_id: str
    message: str
    file_ids: list[str] = []

@router.post("/stream")
async def chat_stream(body: ChatRequest, db: AsyncSession = Depends(get_db)):
    proj = await db.execute(select(Project).where(Project.id == body.project_id))
    project = proj.scalar_one_or_none()
    if not project: raise HTTPException(404, "專案不存在")
    hist_r = await db.execute(select(Message).where(Message.project_id == body.project_id).order_by(Message.created_at.asc()))
    history_msgs = hist_r.scalars().all()
    user_msg = Message(project_id=body.project_id, role="user", content=body.message, file_refs=json.dumps(body.file_ids))
    db.add(user_msg); await db.commit()
    gemini_files = []
    if body.file_ids:
        files_r = await db.execute(select(File).where(File.id.in_(body.file_ids)))
        for f in files_r.scalars().all():
            if f.gemini_file_uri:
                gemini_files.append({"file_data":{"mime_type":"application/pdf","file_uri":f.gemini_file_uri}})
    history = [{"role":"model" if m.role=="assistant" else "user","parts":[m.content]} for m in history_msgs]
    history.append({"role":"user","parts":[body.message]})
    system = f"你正在協助管理專案「{project.name}」。{project.description}"
    async def generate():
        full = ""
        async for chunk in stream_chat(messages=history, system_prompt=system, files=gemini_files):
            full += chunk
            yield f"data: {json.dumps({'text':chunk},ensure_ascii=False)}\n\n"
        async with db.begin():
            db.add(Message(project_id=body.project_id, role="assistant", content=full))
        yield f"data: {json.dumps({'done':True},ensure_ascii=False)}\n\n"
    return StreamingResponse(generate(), media_type="text/event-stream", headers={"Cache-Control":"no-cache","X-Accel-Buffering":"no"})

@router.get("/{project_id}/history")
async def get_history(project_id: str, limit: int = 50, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Message).where(Message.project_id == project_id).order_by(Message.created_at.asc()).limit(limit))
    return [{"id":m.id,"role":m.role,"content":m.content,"file_refs":json.loads(m.file_refs or "[]"),"created_at":str(m.created_at)} for m in r.scalars().all()]

@router.delete("/{project_id}/history")
async def clear_history(project_id: str, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Message).where(Message.project_id == project_id))
    for m in r.scalars().all(): await db.delete(m)
    await db.commit(); return {"success": True}
PYEOF

cat > backend/app/api/files.py << 'PYEOF'
from fastapi import APIRouter, Depends, UploadFile, HTTPException, BackgroundTasks
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import os, aiofiles, uuid, mimetypes
from ..db.database import get_db
from ..db.models import File, Project
from ..core.gemini import upload_file_to_gemini, generate_file_summary

router = APIRouter(prefix="/files", tags=["files"])
UPLOAD_DIR = "./data/uploads"
ALLOWED = {"application/pdf":"pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document":"docx",
           "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"xlsx","text/plain":"txt",
           "image/jpeg":"image","image/png":"image","image/webp":"image"}
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload/{project_id}")
async def upload_file(project_id: str, file: UploadFile, bg: BackgroundTasks, db: AsyncSession = Depends(get_db)):
    proj = await db.execute(select(Project).where(Project.id == project_id))
    if not proj.scalar_one_or_none(): raise HTTPException(404, "專案不存在")
    ct = file.content_type or mimetypes.guess_type(file.filename)[0] or ""
    ft = ALLOWED.get(ct)
    if not ft: raise HTTPException(400, f"不支援的檔案類型: {ct}")
    fid = str(uuid.uuid4())
    ext = os.path.splitext(file.filename)[1]
    lpath = os.path.join(UPLOAD_DIR, f"{fid}{ext}")
    content = await file.read()
    async with aiofiles.open(lpath, "wb") as f2: await f2.write(content)
    dbf = File(id=fid, project_id=project_id, filename=f"{fid}{ext}", original_name=file.filename, file_type=ft, file_size=len(content))
    db.add(dbf); await db.commit()
    bg.add_task(_process, fid, lpath, ct, file.filename, db)
    return {"id":fid,"filename":file.filename,"file_type":ft,"file_size":len(content),"status":"processing"}

async def _process(fid, lpath, mime, name, db):
    from ..db.database import AsyncSessionLocal
    async with AsyncSessionLocal() as session:
        try:
            r = await upload_file_to_gemini(lpath, mime, name)
            fp = {"file_data":{"mime_type":mime,"file_uri":r["uri"]}}
            summary = await generate_file_summary(fp, name)
            res = await session.execute(__import__('sqlalchemy', fromlist=['select']).select(File).where(File.id == fid))
            f = res.scalar_one_or_none()
            if f: f.gemini_file_uri = r["uri"]; f.summary = summary; f.is_indexed = True; await session.commit()
        except Exception as e: print(f"[File Error] {e}")

@router.get("/{project_id}")
async def list_files(project_id: str, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(File).where(File.project_id == project_id).order_by(File.created_at.desc()))
    return [{"id":f.id,"original_name":f.original_name,"file_type":f.file_type,"file_size":f.file_size,"summary":f.summary,"is_indexed":f.is_indexed,"created_at":str(f.created_at)} for f in r.scalars().all()]

@router.delete("/{file_id}")
async def delete_file(file_id: str, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(File).where(File.id == file_id))
    f = r.scalar_one_or_none()
    if not f: raise HTTPException(404, "檔案不存在")
    lp = os.path.join(UPLOAD_DIR, f.filename)
    if os.path.exists(lp): os.remove(lp)
    await db.delete(f); await db.commit(); return {"success": True}
PYEOF

cat > backend/app/api/tasks.py << 'PYEOF'
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from typing import Optional
from ..db.database import get_db
from ..db.models import Task, Project
from ..core.gemini import extract_tasks_from_text

router = APIRouter(prefix="/tasks", tags=["tasks"])

class TaskCreate(BaseModel):
    title: str; description: str = ""; priority: str = "medium"
    assignee: str = ""; due_date: str = ""; status: str = "todo"

class TaskUpdate(BaseModel):
    title: Optional[str]=None; description: Optional[str]=None; status: Optional[str]=None
    priority: Optional[str]=None; assignee: Optional[str]=None; due_date: Optional[str]=None

class AIGen(BaseModel): text: str

@router.get("/{project_id}")
async def list_tasks(project_id: str, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Task).where(Task.project_id == project_id).order_by(Task.created_at.asc()))
    return [{"id":t.id,"title":t.title,"description":t.description,"status":t.status,"priority":t.priority,"assignee":t.assignee,"due_date":t.due_date,"created_at":str(t.created_at),"updated_at":str(t.updated_at)} for t in r.scalars().all()]

@router.post("/{project_id}")
async def create_task(project_id: str, body: TaskCreate, db: AsyncSession = Depends(get_db)):
    t = Task(project_id=project_id, title=body.title, description=body.description, priority=body.priority, assignee=body.assignee, due_date=body.due_date, status=body.status)
    db.add(t); await db.commit(); await db.refresh(t); return {"id":t.id,"title":t.title,"status":t.status}

@router.patch("/{task_id}")
async def update_task(task_id: str, body: TaskUpdate, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Task).where(Task.id == task_id))
    t = r.scalar_one_or_none()
    if not t: raise HTTPException(404, "任務不存在")
    if body.title: t.title=body.title
    if body.description is not None: t.description=body.description
    if body.status: t.status=body.status
    if body.priority: t.priority=body.priority
    if body.assignee is not None: t.assignee=body.assignee
    if body.due_date is not None: t.due_date=body.due_date
    await db.commit(); return {"success": True}

@router.delete("/{task_id}")
async def delete_task(task_id: str, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Task).where(Task.id == task_id))
    t = r.scalar_one_or_none()
    if not t: raise HTTPException(404,"任務不存在")
    await db.delete(t); await db.commit(); return {"success": True}

@router.post("/{project_id}/ai-generate")
async def ai_generate(project_id: str, body: AIGen, db: AsyncSession = Depends(get_db)):
    extracted = await extract_tasks_from_text(body.text)
    created = []
    for t in extracted:
        task = Task(project_id=project_id, title=t.get("title","未命名"), description=t.get("description",""), priority=t.get("priority","medium"), due_date=t.get("due_date",""))
        db.add(task); created.append(task)
    await db.commit(); return {"created":len(created),"tasks":[{"id":t.id,"title":t.title} for t in created]}
PYEOF

cat > backend/app/api/reports.py << 'PYEOF'
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
from ..db.database import get_db
from ..db.models import Project, Report, Task
from ..core.gemini import generate_project_report

router = APIRouter(prefix="/reports", tags=["reports"])

class ReportReq(BaseModel): report_type: str; extra_context: str = ""

@router.post("/{project_id}/generate")
async def generate(project_id: str, body: ReportReq, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Project).where(Project.id == project_id))
    p = r.scalar_one_or_none()
    if not p: raise HTTPException(404, "專案不存在")
    tr = await db.execute(select(Task).where(Task.project_id == project_id))
    tasks = tr.scalars().all()
    ctx = f"專案：{p.name}\n{p.description}\n\n任務：\n" + "\n".join([f"- [{t.status}] {t.title}" for t in tasks]) + (f"\n\n{body.extra_context}" if body.extra_context else "")
    content = await generate_project_report(p.name, body.report_type, ctx)
    names = {"progress":"進度報告","meeting":"會議紀錄","risk":"風險分析","weekly":"週報"}
    rep = Report(project_id=project_id, title=f"{names.get(body.report_type,'報告')} - {p.name}", report_type=body.report_type, content=content)
    db.add(rep); await db.commit(); await db.refresh(rep)
    return {"id":rep.id,"title":rep.title,"content":content,"created_at":str(rep.created_at)}

@router.get("/{project_id}")
async def list_reports(project_id: str, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Report).where(Report.project_id == project_id).order_by(Report.created_at.desc()))
    return [{"id":r2.id,"title":r2.title,"report_type":r2.report_type,"content":r2.content,"created_at":str(r2.created_at)} for r2 in r.scalars().all()]

@router.delete("/{report_id}")
async def delete_report(report_id: str, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(Report).where(Report.id == report_id))
    rep = r.scalar_one_or_none()
    if not rep: raise HTTPException(404,"報告不存在")
    await db.delete(rep); await db.commit(); return {"success": True}
PYEOF

cat > backend/app/api/agent.py << 'PYEOF'
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import json, os, asyncio
from datetime import datetime
from ..db.database import get_db
from ..db.models import AgentCommand

router = APIRouter(prefix="/agent", tags=["agent"])

class ConnMgr:
    def __init__(self): self.agent_ws=None; self.clients=[]
    async def connect_agent(self, ws): await ws.accept(); self.agent_ws=ws
    async def connect_client(self, ws): await ws.accept(); self.clients.append(ws)
    def disconnect_agent(self): self.agent_ws=None
    def disconnect_client(self, ws):
        if ws in self.clients: self.clients.remove(ws)
    async def send_to_agent(self, data):
        if not self.agent_ws: return False
        await self.agent_ws.send_text(json.dumps(data, ensure_ascii=False)); return True
    async def broadcast(self, data):
        for c in self.clients.copy():
            try: await c.send_text(json.dumps(data, ensure_ascii=False))
            except: self.clients.remove(c)

mgr = ConnMgr()

class CmdReq(BaseModel): command: str

@router.post("/command")
async def send_command(body: CmdReq, db: AsyncSession = Depends(get_db)):
    cmd = AgentCommand(command=body.command, status="pending")
    db.add(cmd); await db.commit(); await db.refresh(cmd)
    sent = await mgr.send_to_agent({"type":"command","id":cmd.id,"command":body.command,"timestamp":datetime.now().isoformat()})
    return {"id":cmd.id,"command":body.command,"status":"sent" if sent else "queued","agent_online":sent}

@router.get("/commands")
async def list_commands(limit: int = 20, db: AsyncSession = Depends(get_db)):
    r = await db.execute(select(AgentCommand).order_by(AgentCommand.created_at.desc()).limit(limit))
    return [{"id":c.id,"command":c.command,"status":c.status,"result":c.result,"created_at":str(c.created_at)} for c in r.scalars().all()]

@router.get("/status")
async def status(): return {"online": mgr.agent_ws is not None}

@router.websocket("/ws/agent")
async def agent_ws(ws: WebSocket):
    if ws.query_params.get("token","") != os.getenv("AGENT_SECRET_TOKEN","change_this_secret_token"):
        await ws.close(code=4001); return
    await mgr.connect_agent(ws)
    await mgr.broadcast({"type":"agent_status","online":True})
    try:
        async for db in get_db():
            while True:
                try:
                    data = json.loads(await asyncio.wait_for(ws.receive_text(), timeout=30))
                    if data.get("type")=="result":
                        r = await db.execute(select(AgentCommand).where(AgentCommand.id==data.get("id")))
                        c = r.scalar_one_or_none()
                        if c: c.status=data.get("status","done"); c.result=data.get("result",""); await db.commit()
                        await mgr.broadcast({"type":"command_result","id":data.get("id"),"result":data.get("result"),"status":data.get("status")})
                    elif data.get("type")=="ping": await ws.send_text(json.dumps({"type":"pong"}))
                except asyncio.TimeoutError: await ws.send_text(json.dumps({"type":"ping"}))
    except WebSocketDisconnect:
        mgr.disconnect_agent(); await mgr.broadcast({"type":"agent_status","online":False})

@router.websocket("/ws/monitor")
async def monitor_ws(ws: WebSocket):
    await mgr.connect_client(ws)
    await ws.send_text(json.dumps({"type":"agent_status","online":mgr.agent_ws is not None}))
    try:
        while True: await ws.receive_text()
    except WebSocketDisconnect: mgr.disconnect_client(ws)
PYEOF

cat > backend/app/main.py << 'PYEOF'
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os
load_dotenv()
from .db.database import init_db
from .core.gemini import init_gemini
from .api import projects, chat, files, tasks, reports, agent

@asynccontextmanager
async def lifespan(app):
    await init_db(); init_gemini()
    print("✅ 後端啟動完成")
    yield

app = FastAPI(title="個人AI助理API", lifespan=lifespan)
app.add_middleware(CORSMiddleware,
    allow_origins=[os.getenv("FRONTEND_URL","http://localhost:3000"),"http://localhost:3000"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.include_router(projects.router, prefix="/api")
app.include_router(chat.router,     prefix="/api")
app.include_router(files.router,    prefix="/api")
app.include_router(tasks.router,    prefix="/api")
app.include_router(reports.router,  prefix="/api")
app.include_router(agent.router,    prefix="/api")

@app.get("/")
async def root(): return {"status":"ok","message":"個人AI助理API 🚀"}
PYEOF

# ════════════════════════════════════════
# FRONTEND FILES
# ════════════════════════════════════════

cat > frontend/package.json << 'JSEOF'
{
  "name": "personal-ai-assistant",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "14.2.0",
    "react": "^18",
    "react-dom": "^18",
    "typescript": "^5",
    "@types/node": "^20",
    "@types/react": "^18",
    "@types/react-dom": "^18",
    "tailwindcss": "^3.4.0",
    "autoprefixer": "^10.0.0",
    "postcss": "^8",
    "lucide-react": "^0.400.0",
    "react-markdown": "^9.0.0",
    "remark-gfm": "^4.0.0",
    "react-dropzone": "^14.2.0",
    "next-pwa": "^5.6.0"
  }
}
JSEOF

cat > frontend/next.config.js << 'JSEOF'
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [{
      source: "/api/:path*",
      destination: `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000"}/api/:path*`,
    }];
  },
};
module.exports = nextConfig;
JSEOF

cat > frontend/tailwind.config.ts << 'JSEOF'
import type { Config } from "tailwindcss";
const config: Config = {
  content: ["./pages/**/*.{js,ts,jsx,tsx,mdx}","./components/**/*.{js,ts,jsx,tsx,mdx}","./app/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: { extend: {} },
  plugins: [],
};
export default config;
JSEOF

cat > frontend/postcss.config.js << 'JSEOF'
module.exports = { plugins: { tailwindcss: {}, autoprefixer: {} } };
JSEOF

cat > frontend/tsconfig.json << 'JSEOF'
{
  "compilerOptions": {
    "target": "es5","lib": ["dom","dom.iterable","esnext"],"allowJs": true,
    "skipLibCheck": true,"strict": true,"noEmit": true,"esModuleInterop": true,
    "module": "esnext","moduleResolution": "bundler","resolveJsonModule": true,
    "isolatedModules": true,"jsx": "preserve","incremental": true,
    "plugins": [{"name": "next"}],
    "paths": {"@/*": ["./*"]}
  },
  "include": ["next-env.d.ts","**/*.ts","**/*.tsx",".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
JSEOF

cat > frontend/.env.local.example << 'JSEOF'
NEXT_PUBLIC_API_URL=http://localhost:8000
JSEOF

cat > frontend/public/manifest.json << 'JSEOF'
{
  "name": "個人 AI 助理","short_name": "AI 助理",
  "start_url": "/","display": "standalone",
  "background_color": "#030712","theme_color": "#6366f1",
  "icons": [
    {"src": "/icons/icon-192.png","sizes": "192x192","type": "image/png"},
    {"src": "/icons/icon-512.png","sizes": "512x512","type": "image/png"}
  ]
}
JSEOF

# ════════════════════════════════════════
# AGENT FILES
# ════════════════════════════════════════

cat > agent/requirements.txt << 'PYEOF'
google-generativeai==0.8.3
websockets==13.1
python-dotenv==1.0.1
PYEOF

cat > agent/.env.example << 'PYEOF'
GEMINI_API_KEY=your_gemini_api_key_here
BACKEND_WS_URL=ws://localhost:8000/api/agent/ws/agent
AGENT_SECRET_TOKEN=change_this_secret_token
PYEOF

cat > agent/start.bat << 'BATEOF'
@echo off
chcp 65001 > nul
title 個人AI助理 - Windows Agent
cd /d "%~dp0"
python agent.py
pause
BATEOF

# ════════════════════════════════════════
# 完成
# ════════════════════════════════════════

echo ""
echo "======================================"
echo "✅ 所有檔案建立完成！"
echo "📁 位置：$TARGET"
echo ""
echo "🚀 下一步："
echo "  1. conda create -n ai-assistant python=3.11 -y"
echo "  2. conda activate ai-assistant"
echo "  3. cd $TARGET/backend && pip install -r requirements.txt"
echo "  4. cp .env.example .env  然後填入 GEMINI_API_KEY"
echo "  5. uvicorn app.main:app --reload"
echo "  6. 另開終端：cd $TARGET/frontend && npm install && npm run dev"
echo "======================================"
