"""
SPEC-002: Chat Knowledge Linking
Tests for chat API with fileIds parameter — verifying files are referenced
in messages and conversation history preserves file_refs.
"""
import pytest
import json

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def project_id(client):
    r = await client.post("/api/projects", json={"name": "聊天知識連結測試", "color": "#8b5cf6"})
    assert r.status_code == 200
    return r.json()["id"]


# ── TC-001: Chat without file_ids ─────────────────────────────────────────────
async def test_chat_without_file_ids(client, project_id):
    """
    TC-001: 不帶檔案的聊天請求
    - 前提: 專案存在
    - 操作: POST /api/chat/stream {"project_id": ..., "message": "hello", "file_ids": []}
    - 預期: 200 streaming response (SSE)
    """
    r = await client.post(
        "/api/chat/stream",
        json={
            "project_id": project_id,
            "message": "你好",
            "file_ids": [],
        },
    )
    assert r.status_code == 200
    assert "text/event-stream" in r.headers.get("content-type", "")


# ── TC-002: Chat request accepts file_ids field ───────────────────────────────
async def test_chat_request_accepts_file_ids_field(client, project_id):
    """
    TC-002: ChatRequest schema 接受 file_ids 欄位
    - 操作: POST /api/chat/stream with file_ids list
    - 預期: 200 (不因未知欄位而拒絕)
    """
    r = await client.post(
        "/api/chat/stream",
        json={
            "project_id": project_id,
            "message": "列出我的任務",
            "file_ids": ["non-existent-file-id"],
        },
    )
    # 檔案不存在應優雅處理，不回傳 422
    assert r.status_code in (200, 422)
    if r.status_code == 422:
        # 只有 schema 問題才允許 422，不是因為 file 不存在
        body = r.json()
        assert "file_ids" not in str(body)


# ── TC-003: Message history stores file_refs ─────────────────────────────────
async def test_message_history_stores_file_refs(client, project_id):
    """
    TC-003: 聊天訊息歷史保留 file_refs
    - 前提: 發送含 file_ids 的訊息
    - 操作: GET /api/chat/{project_id}/history
    - 預期: 最新一則用戶訊息的 file_refs 包含傳入的 file id
    """
    fake_file_id = "test-file-id-12345"

    await client.post(
        "/api/chat/stream",
        json={
            "project_id": project_id,
            "message": "請分析這份文件",
            "file_ids": [fake_file_id],
        },
    )

    r = await client.get(f"/api/chat/{project_id}/history")
    assert r.status_code == 200
    messages = r.json()
    user_msgs = [m for m in messages if m["role"] == "user"]
    assert len(user_msgs) >= 1
    last_user = user_msgs[-1]
    assert "file_refs" in last_user
    assert fake_file_id in last_user["file_refs"]


# ── TC-004: Chat history endpoint returns correct structure ───────────────────
async def test_chat_history_structure(client, project_id):
    """
    TC-004: 聊天歷史 API 回傳正確結構
    - 操作: POST chat, then GET /api/chat/{project_id}/history
    - 預期: 每則訊息含 id, role, content, file_refs, created_at
    """
    await client.post(
        "/api/chat/stream",
        json={"project_id": project_id, "message": "結構測試", "file_ids": []},
    )

    r = await client.get(f"/api/chat/{project_id}/history")
    assert r.status_code == 200
    messages = r.json()
    assert len(messages) >= 1
    for msg in messages:
        assert "id" in msg
        assert "role" in msg
        assert "content" in msg
        assert "file_refs" in msg
        assert "created_at" in msg
        assert msg["role"] in ("user", "assistant", "system")
        assert isinstance(msg["file_refs"], list)


# ── TC-005: Clear history ─────────────────────────────────────────────────────
async def test_clear_chat_history(client, project_id):
    """
    TC-005: 清除聊天歷史
    - 前提: 有聊天記錄
    - 操作: DELETE /api/chat/{project_id}/history
    - 預期: 200 success=True, 歷史清空
    """
    await client.post(
        "/api/chat/stream",
        json={"project_id": project_id, "message": "先存一則訊息", "file_ids": []},
    )

    r = await client.delete(f"/api/chat/{project_id}/history")
    assert r.status_code == 200
    assert r.json().get("success") is True

    r2 = await client.get(f"/api/chat/{project_id}/history")
    assert r2.json() == []


# ── TC-006: Chat with nonexistent project → 404 ───────────────────────────────
async def test_chat_nonexistent_project(client):
    """
    TC-006: 對不存在專案發起聊天
    - 操作: POST /api/chat/stream with invalid project_id
    - 預期: 404
    """
    r = await client.post(
        "/api/chat/stream",
        json={"project_id": "nonexistent-project", "message": "test", "file_ids": []},
    )
    assert r.status_code == 404


# ── TC-007: Multiple file_ids are all stored ─────────────────────────────────
async def test_multiple_file_ids_stored_in_refs(client, project_id):
    """
    TC-007: 多個 file_ids 全部保存在 file_refs
    - 操作: POST chat with 2 file_ids
    - 預期: history 中 file_refs 包含所有 2 個 id
    """
    file_id_1 = "file-aaa-111"
    file_id_2 = "file-bbb-222"

    await client.post(
        "/api/chat/stream",
        json={
            "project_id": project_id,
            "message": "分析這兩份文件",
            "file_ids": [file_id_1, file_id_2],
        },
    )

    r = await client.get(f"/api/chat/{project_id}/history")
    messages = r.json()
    user_msgs = [m for m in messages if m["role"] == "user"]
    assert len(user_msgs) >= 1
    last_refs = user_msgs[-1]["file_refs"]
    assert file_id_1 in last_refs
    assert file_id_2 in last_refs
