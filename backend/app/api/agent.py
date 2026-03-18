"""
Windows Agent 指令接收 API + WebSocket 控制器
手機 → 後端 → Windows Agent → 執行 → 回報結果
"""
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import json, os, asyncio
from datetime import datetime

from ..db.database import get_db
from ..db.models import AgentCommand

router = APIRouter(prefix="/agent", tags=["agent"])

# ── WebSocket 連線管理 ────────────────────────────────────
class AgentConnectionManager:
    def __init__(self):
        self.agent_ws: WebSocket | None = None   # Windows Agent 連線
        self.clients: list[WebSocket] = []       # 前端監聽連線

    async def connect_agent(self, ws: WebSocket):
        await ws.accept()
        self.agent_ws = ws

    async def connect_client(self, ws: WebSocket):
        await ws.accept()
        self.clients.append(ws)

    def disconnect_agent(self):
        self.agent_ws = None

    def disconnect_client(self, ws: WebSocket):
        if ws in self.clients:
            self.clients.remove(ws)

    async def send_command_to_agent(self, command: dict) -> bool:
        if not self.agent_ws:
            return False
        await self.agent_ws.send_text(json.dumps(command, ensure_ascii=False))
        return True

    async def broadcast_to_clients(self, data: dict):
        for client in self.clients.copy():
            try:
                await client.send_text(json.dumps(data, ensure_ascii=False))
            except Exception:
                self.clients.remove(client)

manager = AgentConnectionManager()

# ── REST API ─────────────────────────────────────────────
class CommandRequest(BaseModel):
    command: str   # 自然語言指令，如「整理桌面上的 PDF 檔案」

@router.post("/command")
async def send_command(body: CommandRequest, db: AsyncSession = Depends(get_db)):
    """手機/前端發送指令到 Windows Agent"""
    cmd = AgentCommand(command=body.command, status="pending")
    db.add(cmd)
    await db.commit()
    await db.refresh(cmd)

    # 發送到 Agent（如果已連線）
    sent = await manager.send_command_to_agent({
        "type": "command",
        "id": cmd.id,
        "command": body.command,
        "timestamp": datetime.now().isoformat()
    })

    return {
        "id": cmd.id,
        "command": body.command,
        "status": "sent" if sent else "queued",
        "agent_online": sent
    }

@router.get("/commands")
async def list_commands(limit: int = 20, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(AgentCommand)
        .order_by(AgentCommand.created_at.desc())
        .limit(limit)
    )
    cmds = result.scalars().all()
    return [
        {
            "id": c.id,
            "command": c.command,
            "status": c.status,
            "result": c.result,
            "created_at": str(c.created_at),
            "updated_at": str(c.updated_at),
        }
        for c in cmds
    ]

@router.get("/status")
async def agent_status():
    return {"online": manager.agent_ws is not None}

# ── WebSocket：Windows Agent 連線 ───────────────────────
@router.websocket("/ws/agent")
async def agent_websocket(ws: WebSocket):
    token = ws.query_params.get("token", "")
    if token != os.getenv("AGENT_SECRET_TOKEN", "change_this_secret_token"):
        await ws.close(code=4001)
        return

    await manager.connect_agent(ws)
    print("[Agent] Windows Agent 已連線")
    await manager.broadcast_to_clients({"type": "agent_status", "online": True})

    try:
        async for db in get_db():
            while True:
                try:
                    data = await asyncio.wait_for(ws.receive_text(), timeout=30)
                    msg = json.loads(data)

                    if msg.get("type") == "result":
                        # Agent 回報執行結果
                        cmd_id = msg.get("id")
                        result = msg.get("result", "")
                        status = msg.get("status", "done")

                        r = await db.execute(select(AgentCommand).where(AgentCommand.id == cmd_id))
                        cmd = r.scalar_one_or_none()
                        if cmd:
                            cmd.status = status
                            cmd.result = result
                            await db.commit()

                        await manager.broadcast_to_clients({
                            "type": "command_result",
                            "id": cmd_id,
                            "result": result,
                            "status": status
                        })

                    elif msg.get("type") == "ping":
                        await ws.send_text(json.dumps({"type": "pong"}))

                except asyncio.TimeoutError:
                    await ws.send_text(json.dumps({"type": "ping"}))

    except WebSocketDisconnect:
        manager.disconnect_agent()
        print("[Agent] Windows Agent 已斷線")
        await manager.broadcast_to_clients({"type": "agent_status", "online": False})

# ── WebSocket：前端監聽 Agent 狀態/結果 ─────────────────
@router.websocket("/ws/monitor")
async def monitor_websocket(ws: WebSocket):
    await manager.connect_client(ws)
    await ws.send_text(json.dumps({
        "type": "agent_status",
        "online": manager.agent_ws is not None
    }))
    try:
        while True:
            await ws.receive_text()   # 保持連線
    except WebSocketDisconnect:
        manager.disconnect_client(ws)
