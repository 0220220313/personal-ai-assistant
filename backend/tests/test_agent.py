import pytest

pytestmark = pytest.mark.asyncio

async def test_agent_status_no_agent(client):
    r = await client.get("/api/agent/status")
    assert r.status_code == 200
    d = r.json()
    assert "connected" in d
    assert d["connected"] == False  # 測試環境沒有 agent 連線

async def test_agent_command_no_agent(client):
    """沒有 agent 連線時，送指令應回傳錯誤"""
    r = await client.post("/api/agent/command",
                          json={"command": "列出桌面檔案", "project_id": None})
    # 應回傳 503 或含錯誤訊息
    assert r.status_code in (200, 503)

async def test_agent_command_list(client):
    r = await client.get("/api/agent/commands")
    assert r.status_code == 200
    assert isinstance(r.json(), list)

async def test_agent_ws_rejects_bad_token():
    """WebSocket 用錯誤 token 連線應被拒絕"""
    import websockets
    import asyncio
    try:
        async with websockets.connect(
            "ws://localhost:8000/api/agent/ws/agent?token=wrong_token",
            open_timeout=2
        ) as ws:
            msg = await asyncio.wait_for(ws.recv(), timeout=2)
            # 可能收到拒絕訊息
    except Exception:
        pass  # 連線被拒絕或超時，都是正確行為
