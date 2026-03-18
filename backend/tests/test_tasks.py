import pytest

pytestmark = pytest.mark.asyncio

@pytest.fixture
async def project_id(client):
    r = await client.post("/api/projects", json={"name": "任務測試專案", "color": "#8b5cf6"})
    return r.json()["id"]

async def test_create_task(client, project_id):
    r = await client.post(f"/api/tasks/{project_id}", json={
        "title": "實作登入頁面", "description": "包含 OAuth", "status": "todo", "priority": "high"
    })
    assert r.status_code == 200
    d = r.json()
    assert d["title"] == "實作登入頁面"
    assert d["status"] == "todo"
    assert d["priority"] == "high"

async def test_list_tasks(client, project_id):
    await client.post(f"/api/tasks/{project_id}", json={"title": "任務A", "status": "todo"})
    await client.post(f"/api/tasks/{project_id}", json={"title": "任務B", "status": "in_progress"})
    r = await client.get(f"/api/tasks/{project_id}")
    assert r.status_code == 200
    tasks = r.json()
    assert len(tasks) >= 2

async def test_update_task_status(client, project_id):
    create = await client.post(f"/api/tasks/{project_id}", json={"title": "狀態更新任務", "status": "todo"})
    tid = create.json()["id"]
    r = await client.patch(f"/api/tasks/{project_id}/{tid}", json={"status": "done"})
    assert r.status_code == 200
    assert r.json()["status"] == "done"

async def test_delete_task(client, project_id):
    create = await client.post(f"/api/tasks/{project_id}", json={"title": "待刪除任務", "status": "todo"})
    tid = create.json()["id"]
    r = await client.delete(f"/api/tasks/{project_id}/{tid}")
    assert r.status_code == 200
