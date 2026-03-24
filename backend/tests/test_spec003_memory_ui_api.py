"""
SPEC-003: Memory UI API
Tests for ProjectMemory CRUD — list, create/upsert, delete by key, clear all.
Focuses on UI-facing acceptance criteria: field validation, error handling,
response structure, and edge cases.
"""
import pytest

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def project_id(client):
    r = await client.post("/api/projects", json={"name": "記憶UI測試專案", "color": "#f59e0b"})
    assert r.status_code == 200
    return r.json()["id"]


# ── TC-001: Create memory returns correct fields ───────────────────────────────
async def test_create_memory_response_structure(client, project_id):
    """
    TC-001: 建立記憶回傳正確欄位
    - 操作: POST /api/projects/{id}/memory {"key": "test", "value": "hello"}
    - 預期: 200 + {id, key, action="created"}
    """
    r = await client.post(
        f"/api/projects/{project_id}/memory",
        json={"key": "structure_test", "value": "some value"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "id" in data
    assert data["key"] == "structure_test"
    assert data["action"] == "created"


# ── TC-002: List memories returns full field set ───────────────────────────────
async def test_list_memories_full_fields(client, project_id):
    """
    TC-002: 列出記憶包含所有欄位
    - 前提: 已建立 1 筆記憶
    - 操作: GET /api/projects/{id}/memory
    - 預期: 每筆記憶含 id, key, value, created_at, updated_at
    """
    await client.post(
        f"/api/projects/{project_id}/memory",
        json={"key": "field_check", "value": "data"},
    )
    r = await client.get(f"/api/projects/{project_id}/memory")
    assert r.status_code == 200
    memories = r.json()
    assert len(memories) >= 1
    for m in memories:
        assert "id" in m
        assert "key" in m
        assert "value" in m
        assert "created_at" in m
        assert "updated_at" in m


# ── TC-003: Upsert same key updates value, no duplicate ──────────────────────
async def test_upsert_overwrites_existing_key(client, project_id):
    """
    TC-003: 同 key 的 upsert 覆寫值、不產生重複
    - 操作: POST 兩次相同 key，第二次用不同 value
    - 預期: GET 只有 1 筆，值為最新
    """
    await client.post(
        f"/api/projects/{project_id}/memory",
        json={"key": "lang", "value": "Python"},
    )
    r2 = await client.post(
        f"/api/projects/{project_id}/memory",
        json={"key": "lang", "value": "TypeScript"},
    )
    assert r2.status_code == 200
    assert r2.json()["action"] == "updated"

    r = await client.get(f"/api/projects/{project_id}/memory")
    entries = [m for m in r.json() if m["key"] == "lang"]
    assert len(entries) == 1
    assert entries[0]["value"] == "TypeScript"


# ── TC-004: Delete by key ─────────────────────────────────────────────────────
async def test_delete_memory_by_key(client, project_id):
    """
    TC-004: 刪除指定 key 的記憶
    - 操作: POST 建立 key, DELETE /memory/{key}
    - 預期: 200 + {success: true, deleted_key: "..."}, GET 不再包含此 key
    """
    await client.post(
        f"/api/projects/{project_id}/memory",
        json={"key": "to_delete", "value": "bye"},
    )
    r = await client.delete(f"/api/projects/{project_id}/memory/to_delete")
    assert r.status_code == 200
    data = r.json()
    assert data.get("success") is True
    assert data.get("deleted_key") == "to_delete"

    r2 = await client.get(f"/api/projects/{project_id}/memory")
    keys = [m["key"] for m in r2.json()]
    assert "to_delete" not in keys


# ── TC-005: Delete non-existent key → 404 ─────────────────────────────────────
async def test_delete_nonexistent_key_returns_404(client, project_id):
    """
    TC-005: 刪除不存在的 key 回傳 404
    - 操作: DELETE /api/projects/{id}/memory/nonexistent
    - 預期: 404
    """
    r = await client.delete(f"/api/projects/{project_id}/memory/nonexistent_key_xyz")
    assert r.status_code == 404


# ── TC-006: Clear all memories ────────────────────────────────────────────────
async def test_clear_all_memories(client, project_id):
    """
    TC-006: 清空所有記憶
    - 前提: 已有多筆記憶
    - 操作: DELETE /api/projects/{id}/memory
    - 預期: 200 success=True, GET 回傳 []
    """
    for k in ["a", "b", "c"]:
        await client.post(
            f"/api/projects/{project_id}/memory",
            json={"key": k, "value": str(k) + "_value"},
        )

    r = await client.delete(f"/api/projects/{project_id}/memory")
    assert r.status_code == 200
    assert r.json().get("success") is True

    r2 = await client.get(f"/api/projects/{project_id}/memory")
    assert r2.json() == []


# ── TC-007: Get memories for nonexistent project → 404 ───────────────────────
async def test_get_memories_nonexistent_project(client):
    """
    TC-007: 對不存在專案取得記憶回傳 404
    - 操作: GET /api/projects/nonexistent/memory
    - 預期: 404
    """
    r = await client.get("/api/projects/nonexistent-project-id/memory")
    assert r.status_code == 404


# ── TC-008: Create memory for nonexistent project → 404 ──────────────────────
async def test_create_memory_nonexistent_project(client):
    """
    TC-008: 對不存在專案建立記憶回傳 404
    - 操作: POST /api/projects/nonexistent/memory
    - 預期: 404
    """
    r = await client.post(
        "/api/projects/nonexistent-project-id/memory",
        json={"key": "k", "value": "v"},
    )
    assert r.status_code == 404


# ── TC-009: Multiple distinct keys coexist ───────────────────────────────────
async def test_multiple_keys_coexist(client, project_id):
    """
    TC-009: 多個不同 key 可以並存
    - 操作: 建立 3 個不同 key
    - 預期: GET 回傳 3 筆
    """
    keys = ["pref_lang", "pref_theme", "user_name"]
    for k in keys:
        await client.post(
            f"/api/projects/{project_id}/memory",
            json={"key": k, "value": f"value_for_{k}"},
        )

    r = await client.get(f"/api/projects/{project_id}/memory")
    stored_keys = [m["key"] for m in r.json()]
    for k in keys:
        assert k in stored_keys


# ── TC-010: Memory values are persisted correctly (long text) ─────────────────
async def test_memory_stores_long_text_value(client, project_id):
    """
    TC-010: 記憶可以存放長文字 value
    - 操作: POST 500 字的 value
    - 預期: GET 取回完整相同的 value
    """
    long_value = "這是一段很長的記憶內容。" * 50  # ~600 chars
    await client.post(
        f"/api/projects/{project_id}/memory",
        json={"key": "long_text", "value": long_value},
    )
    r = await client.get(f"/api/projects/{project_id}/memory")
    entries = [m for m in r.json() if m["key"] == "long_text"]
    assert len(entries) == 1
    assert entries[0]["value"] == long_value
