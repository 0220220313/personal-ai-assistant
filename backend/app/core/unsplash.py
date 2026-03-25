import httpx
import os
from typing import Optional

UNSPLASH_ACCESS_KEY = os.getenv("UNSPLASH_ACCESS_KEY", "")


async def search_image(keyword: str) -> Optional[str]:
    """回傳圖片 URL，失敗回傳 None"""
    if not UNSPLASH_ACCESS_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(
                "https://api.unsplash.com/search/photos",
                params={"query": keyword, "per_page": 1, "orientation": "landscape"},
                headers={"Authorization": f"Client-ID {UNSPLASH_ACCESS_KEY}"},
            )
            data = r.json()
            if data.get("results"):
                return data["results"][0]["urls"]["regular"]
    except Exception:
        pass
    return None
