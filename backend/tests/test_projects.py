import pytest

pytestmark = pytest.mark.asyncio

# ── 專案 CRUD ──────────────────────────────────────────────
async def test_create_project(client):
    r = await client.post("/api/projects", json={"name": "測試專案", "color": "#6366f1"})
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "測試專案"
    assert data["color"] == "#6366f1"
    assert "id" in data
    return data["id"]

async def test_list_projects(client):
    r = await client.get("/api/projects")
    assert r.status_code == 200
    assert isinstance(r.json(), list)

async def test_get_project(client):
    create = await client.post("/api/projects", json={"name": "取得測試", "color": "#ec4899"})
    pid = create.json()["id"]
    r = await client.get(f"/api/projects/{pid}")
    assert r.status_code == 200
    assert r.json()["id"] == pid

async def test_update_project(client):
    create = await client.post("/api/projects", json={"name": "原始名稱", "color": "#10b981"})
    pid = create.json()["id"]
    r = await client.patch(f"/api/projects/{pid}", json={"name": "更新後名稱"})
    assert r.status_code == 200
    assert r.json()["name"] == "更新後名稱"

async def test_delete_project(client):
    create = await client.post("/api/projects", json={"name": "待刪除", "color": "#ef4444"})
    pid = create.json()["id"]
    r = await client.delete(f"/api/projects/{pid}")
    assert r.status_code == 200
    r2 = await client.get(f"/api/projects/{pid}")
    assert r2.status_code == 404

async def test_get_nonexistent_project(client):
    r = await client.get("/api/projects/nonexistent-id")
    assert r.status_code == 404
