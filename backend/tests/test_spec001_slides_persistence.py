"""
SPEC-001: Slides Persistence
Tests for presentation CRUD via in-memory store (pending DB migration).
"""
import pytest

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def project_id(client):
    r = await client.post("/api/projects", json={"name": "簡報測試專案", "color": "#6366f1"})
    assert r.status_code == 200
    return r.json()["id"]


# ── TC-001: Generate slides ────────────────────────────────────────────────────
async def test_generate_slides_returns_presentation(client, project_id):
    """
    TC-001: 生成簡報
    - 前提: 專案存在
    - 操作: POST /api/slides/{project_id}/generate
    - 預期: 200 + presentation object with id, title, slides list
    """
    r = await client.post(
        f"/api/slides/{project_id}/generate",
        json={"topic": "AI 簡報測試", "num_slides": 3, "template": "professional"},
    )
    assert r.status_code == 200
    data = r.json()
    assert "id" in data
    assert "title" in data
    assert isinstance(data["slides"], list)
    assert data["project_id"] == project_id
    assert data["topic"] == "AI 簡報測試"
    assert data["template"] == "professional"


# ── TC-002: List slides ────────────────────────────────────────────────────────
async def test_list_slides_for_project(client, project_id):
    """
    TC-002: 列出專案的所有簡報
    - 前提: 已生成至少一份簡報
    - 操作: GET /api/slides/{project_id}
    - 預期: 200 + array containing the generated presentation
    """
    gen = await client.post(
        f"/api/slides/{project_id}/generate",
        json={"topic": "列表測試", "num_slides": 3, "template": "minimal"},
    )
    assert gen.status_code == 200
    pres_id = gen.json()["id"]

    r = await client.get(f"/api/slides/{project_id}")
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    ids = [p["id"] for p in items]
    assert pres_id in ids


# ── TC-003: Get single presentation ───────────────────────────────────────────
async def test_get_single_presentation(client, project_id):
    """
    TC-003: 取得單一簡報
    - 前提: 簡報已生成
    - 操作: GET /api/slides/{project_id}/{pres_id}
    - 預期: 200 + full presentation data with slides
    """
    gen = await client.post(
        f"/api/slides/{project_id}/generate",
        json={"topic": "單一取得測試", "num_slides": 3, "template": "modern"},
    )
    pres_id = gen.json()["id"]

    r = await client.get(f"/api/slides/{project_id}/{pres_id}")
    assert r.status_code == 200
    data = r.json()
    assert data["id"] == pres_id
    assert data["project_id"] == project_id
    assert "slides" in data


# ── TC-004: Update presentation ───────────────────────────────────────────────
async def test_update_presentation_title(client, project_id):
    """
    TC-004: 更新簡報標題
    - 前提: 簡報已生成
    - 操作: PATCH /api/slides/{project_id}/{pres_id} {"title": "新標題"}
    - 預期: 200 + updated title
    """
    gen = await client.post(
        f"/api/slides/{project_id}/generate",
        json={"topic": "更新測試", "num_slides": 3, "template": "professional"},
    )
    pres_id = gen.json()["id"]

    r = await client.patch(
        f"/api/slides/{project_id}/{pres_id}",
        json={"title": "已更新的標題"},
    )
    assert r.status_code == 200
    assert r.json()["title"] == "已更新的標題"


# ── TC-005: Delete presentation ───────────────────────────────────────────────
async def test_delete_presentation(client, project_id):
    """
    TC-005: 刪除簡報
    - 前提: 簡報已生成
    - 操作: DELETE /api/slides/{project_id}/{pres_id}
    - 預期: 200 ok=True, GET 後返回空陣列中不含此 id
    """
    gen = await client.post(
        f"/api/slides/{project_id}/generate",
        json={"topic": "刪除測試", "num_slides": 3, "template": "minimal"},
    )
    pres_id = gen.json()["id"]

    r = await client.delete(f"/api/slides/{project_id}/{pres_id}")
    assert r.status_code == 200
    assert r.json().get("ok") is True

    r2 = await client.get(f"/api/slides/{project_id}")
    ids = [p["id"] for p in r2.json()]
    assert pres_id not in ids


# ── TC-006: Get non-existent presentation → 404 ───────────────────────────────
async def test_get_nonexistent_presentation(client, project_id):
    """
    TC-006: 取得不存在的簡報
    - 操作: GET /api/slides/{project_id}/nonexistent-id
    - 預期: 404
    """
    r = await client.get(f"/api/slides/{project_id}/nonexistent-id")
    assert r.status_code == 404


# ── TC-007: Generate for non-existent project → 404 ──────────────────────────
async def test_generate_for_nonexistent_project(client):
    """
    TC-007: 對不存在的專案生成簡報
    - 操作: POST /api/slides/nonexistent-id/generate
    - 預期: 404
    """
    r = await client.post(
        "/api/slides/nonexistent-id/generate",
        json={"topic": "測試", "num_slides": 3},
    )
    assert r.status_code == 404


# ── TC-008: List returns only current project's slides ────────────────────────
async def test_list_isolates_by_project(client):
    """
    TC-008: 不同專案的簡報互相隔離
    - 前提: 兩個不同專案各生成一份簡報
    - 操作: GET /api/slides/{project_a}
    - 預期: 只回傳 project_a 的簡報
    """
    r_a = await client.post("/api/projects", json={"name": "專案A", "color": "#10b981"})
    r_b = await client.post("/api/projects", json={"name": "專案B", "color": "#ef4444"})
    pid_a = r_a.json()["id"]
    pid_b = r_b.json()["id"]

    gen_b = await client.post(
        f"/api/slides/{pid_b}/generate",
        json={"topic": "專案B的簡報", "num_slides": 3},
    )
    pres_b_id = gen_b.json()["id"]

    r = await client.get(f"/api/slides/{pid_a}")
    ids = [p["id"] for p in r.json()]
    assert pres_b_id not in ids
