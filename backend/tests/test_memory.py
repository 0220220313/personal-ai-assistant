import pytest

pytestmark = pytest.mark.asyncio

@pytest.fixture
async def project_id(client):
    r = await client.post("/api/projects", json={"name": "記憶測試專案", "color": "#f59e0b"})
    return r.json()["id"]

async def test_save_memory(client, project_id):
    r = await client.post(f"/api/projects/{project_id}/memory",
                          json={"key": "user_language", "value": "TypeScript"})
    assert r.status_code == 200
    d = r.json()
    assert d["key"] == "user_language"
    assert d["value"] == "TypeScript"

async def test_get_memories(client, project_id):
    await client.post(f"/api/projects/{project_id}/memory", json={"key": "k1", "value": "v1"})
    await client.post(f"/api/projects/{project_id}/memory", json={"key": "k2", "value": "v2"})
    r = await client.get(f"/api/projects/{project_id}/memory")
    assert r.status_code == 200
    memories = r.json()
    keys = [m["key"] for m in memories]
    assert "k1" in keys
    assert "k2" in keys

async def test_upsert_memory(client, project_id):
    """同一個 key 寫兩次，應該 upsert 而非重複建立"""
    await client.post(f"/api/projects/{project_id}/memory", json={"key": "lang", "value": "Python"})
    await client.post(f"/api/projects/{project_id}/memory", json={"key": "lang", "value": "TypeScript"})
    r = await client.get(f"/api/projects/{project_id}/memory")
    entries = [m for m in r.json() if m["key"] == "lang"]
    assert len(entries) == 1
    assert entries[0]["value"] == "TypeScript"

async def test_delete_memory_key(client, project_id):
    await client.post(f"/api/projects/{project_id}/memory", json={"key": "to_delete", "value": "bye"})
    r = await client.delete(f"/api/projects/{project_id}/memory/to_delete")
    assert r.status_code == 200
    r2 = await client.get(f"/api/projects/{project_id}/memory")
    keys = [m["key"] for m in r2.json()]
    assert "to_delete" not in keys

async def test_clear_all_memories(client, project_id):
    await client.post(f"/api/projects/{project_id}/memory", json={"key": "a", "value": "1"})
    await client.post(f"/api/projects/{project_id}/memory", json={"key": "b", "value": "2"})
    r = await client.delete(f"/api/projects/{project_id}/memory")
    assert r.status_code == 200
    r2 = await client.get(f"/api/projects/{project_id}/memory")
    assert r2.json() == []
