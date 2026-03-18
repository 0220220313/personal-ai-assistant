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
async def lifespan(app: FastAPI):
    # 啟動時
    await init_db()
    init_gemini()
    print("✅ 資料庫初始化完成")
    print("✅ Gemini API 初始化完成")
    yield
    # 關閉時（清理資源）

app = FastAPI(
    title="個人 AI 助理 API",
    version="1.0.0",
    lifespan=lifespan
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("FRONTEND_URL", "http://localhost:3000"),
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 路由
app.include_router(projects.router, prefix="/api")
app.include_router(chat.router,     prefix="/api")
app.include_router(files.router,    prefix="/api")
app.include_router(tasks.router,    prefix="/api")
app.include_router(reports.router,  prefix="/api")
app.include_router(agent.router,    prefix="/api")

@app.get("/")
async def root():
    return {"status": "ok", "message": "個人 AI 助理 API 運行中 🚀"}

@app.get("/health")
async def health():
    return {"status": "healthy"}
