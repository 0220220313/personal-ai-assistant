import pytest
import asyncio
from httpx import AsyncClient, ASGITransport
from unittest.mock import AsyncMock, MagicMock, patch
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

# Mock Gemini before any import
mock_genai = MagicMock()
mock_model = MagicMock()
mock_genai.GenerativeModel.return_value = mock_model
sys.modules["google"] = MagicMock()
sys.modules["google.generativeai"] = mock_genai

os.environ.setdefault("GEMINI_API_KEY", "test-key")
os.environ.setdefault("AGENT_SECRET_TOKEN", "test-token")
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///:memory:")

from app.main import app
from app.db.database import init_db

@pytest.fixture(scope="session")
def event_loop():
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()

@pytest.fixture(scope="session")
async def client():
    await init_db()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
