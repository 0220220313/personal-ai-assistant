"""
遠端控制 API — 讓 AI (Discord bot) 遠端監控和操作系統
所有端點都受 REMOTE_ACCESS_TOKEN 保護
"""
from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc
from pydantic import BaseModel
import subprocess, os, json
from datetime import datetime

from ..db.database import get_db
from ..db.models import AgentCommand, Project, Task

router = APIRouter(prefix="/remote", tags=["remote"])
REMOTE_TOKEN = os.getenv("REMOTE_ACCESS_TOKEN", "")

def verify_token(x_remote_token: str = Header(...)):
    if not REMOTE_TOKEN:
        raise HTTPException(403, "REMOTE_ACCESS_TOKEN 未設定於 .env")
    if x_remote_token != REMOTE_TOKEN:
        raise HTTPException(403, "Token 無效")

# ── 健康狀態（AI 定期輪詢用）────────────────────────────
@router.get("/health")
async def health(auth=Depends(verify_token)):
    from ..api.agent import manager
    return {
        "status": "healthy",
        "timestamp": datetime.utcnow().isoformat(),
        "agent_connected": manager.agent_ws is not None,
    }

# ── 讀取 log 尾部 ────────────────────────────────────────
class LogRequest(BaseModel):
    service: str = "backend"  # backend | frontend | agent
    lines: int = 50

@router.post("/logs")
async def get_logs(body: LogRequest, auth=Depends(verify_token)):
    root = os.getenv("PROJECT_ROOT", os.path.expanduser("~/personal-ai-assistant"))
    paths = {
        "backend":  os.path.join(root, "logs", "backend.log"),
        "frontend": os.path.join(root, "logs", "frontend.log"),
        "agent":    os.path.join(root, "logs", "agent.log"),
    }
    path = paths.get(body.service)
    if not path:
        raise HTTPException(400, f"未知服務: {body.service}，可選: backend/frontend/agent")
    try:
        r = subprocess.run(["tail", "-n", str(body.lines), path],
                           capture_output=True, text=True, timeout=5)
        return {"service": body.service, "log": r.stdout or "(log 為空)"}
    except FileNotFoundError:
        return {"service": body.service, "log": "(log 不存在，請先執行 bash start.sh)"}
    except Exception as e:
        return {"service": body.service, "log": f"錯誤: {e}"}

# ── 執行 WSL shell 指令 ──────────────────────────────────
class ShellRequest(BaseModel):
    command: str
    timeout: int = 30

@router.post("/shell")
async def run_shell(body: ShellRequest, auth=Depends(verify_token)):
    BLOCKED = ["rm -rf /", "mkfs", ":(){:|:&};:", "shutdown -", "reboot"]
    for b in BLOCKED:
        if b in body.command:
            raise HTTPException(400, f"危險指令拒絕執行")
    try:
        r = subprocess.run(body.command, shell=True, capture_output=True,
                           text=True, timeout=body.timeout)
        return {
            "command": body.command,
            "stdout":  r.stdout[:3000],
            "stderr":  r.stderr[:500],
            "returncode": r.returncode,
        }
    except subprocess.TimeoutExpired:
        return {"command": body.command, "stdout": "", "stderr": "逾時", "returncode": -1}
    except Exception as e:
        return {"command": body.command, "stdout": "", "stderr": str(e), "returncode": -1}

# ── 傳指令給 Windows Agent ───────────────────────────────
class AgentCmdRequest(BaseModel):
    command: str

@router.post("/agent-command")
async def remote_agent_command(body: AgentCmdRequest,
                                db: AsyncSession = Depends(get_db),
                                auth=Depends(verify_token)):
    from ..api.agent import manager
    if not manager.agent_ws:
        raise HTTPException(503, "Agent 未連線（請確認 WSL Agent 在執行）")
    cmd = AgentCommand(command=body.command, status="pending")
    db.add(cmd)
    await db.commit()
    await db.refresh(cmd)
    await manager.send_command_to_agent({
        "type": "command", "id": cmd.id, "command": body.command
    })
    return {"id": cmd.id, "status": "sent", "command": body.command}

# ── 專案 + 任務概覽 ──────────────────────────────────────
@router.get("/overview")
async def overview(db: AsyncSession = Depends(get_db), auth=Depends(verify_token)):
    projects = (await db.execute(
        select(Project).order_by(desc(Project.updated_at))
    )).scalars().all()
    result = []
    for p in projects:
        tasks = (await db.execute(
            select(Task).where(Task.project_id == p.id)
        )).scalars().all()
        result.append({
            "id": p.id, "name": p.name, "color": p.color,
            "tasks": {
                "todo": sum(1 for t in tasks if t.status == "todo"),
                "in_progress": sum(1 for t in tasks if t.status == "in_progress"),
                "done": sum(1 for t in tasks if t.status == "done"),
            }
        })
    return {"projects": result, "total": len(result)}

# ── 最近 Agent 指令記錄 ──────────────────────────────────
@router.get("/recent-commands")
async def recent_commands(db: AsyncSession = Depends(get_db), auth=Depends(verify_token)):
    cmds = (await db.execute(
        select(AgentCommand).order_by(desc(AgentCommand.created_at)).limit(20)
    )).scalars().all()
    return [{"id": c.id, "command": c.command, "status": c.status,
             "result": (c.result or "")[:300], "created_at": str(c.created_at)}
            for c in cmds]

# ── git pull 最新程式碼 ──────────────────────────────────
@router.post("/deploy")
async def deploy(auth=Depends(verify_token)):
    root = os.getenv("PROJECT_ROOT", os.path.expanduser("~/personal-ai-assistant"))
    r = subprocess.run(["git", "-C", root, "pull", "origin", "main"],
                       capture_output=True, text=True, timeout=60)
    return {
        "stdout": r.stdout, "stderr": r.stderr, "returncode": r.returncode,
        "note": "pull 完成後請執行 bash stop.sh && bash start.sh 重啟服務"
    }
