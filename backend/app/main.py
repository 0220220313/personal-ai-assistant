from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from dotenv import load_dotenv
import os

load_dotenv()

from .db.database import init_db
from .core.gemini import init_gemini
from .api import projects, chat, files, tasks, reports, agent, memory, remote, slides, notifications
from .scheduler import start_scheduler, stop_scheduler

@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    init_gemini()
    start_scheduler()
    print("✅ DB ready")
    print("✅ Gemini ready")
    print("✅ Scheduler ready")
    yield
    stop_scheduler()

app = FastAPI(title="個人 AI 助理 API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(projects.router, prefix="/api")
app.include_router(chat.router,     prefix="/api")
app.include_router(files.router,    prefix="/api")
app.include_router(tasks.router,    prefix="/api")
app.include_router(reports.router,  prefix="/api")
app.include_router(agent.router,    prefix="/api")
app.include_router(memory.router,   prefix="/api")
app.include_router(remote.router,   prefix="/api")
app.include_router(slides.router,   prefix="/api")
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])

@app.get("/")
async def root():
    return {"status": "ok", "message": "個人 AI 助理 API 🚀"}

@app.get("/health")
async def health():
    from .api.agent import manager
    return {"status": "healthy", "agent_connected": manager.agent_ws is not None}
