import httpx
import os
import socket
import ipaddress
from typing import Optional
from urllib.parse import urlparse

UNSPLASH_ACCESS_KEY = os.getenv("UNSPLASH_ACCESS_KEY", "")

_PRIVATE_NETWORKS = [
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("::1/128"),
]


def _validate_url_not_ssrf(url: str) -> None:
    """DNS 解析後驗證 IP 不在私有範圍，防止 SSRF 攻擊。"""
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        raise ValueError(f"Invalid URL (no hostname): {url}")

    try:
        resolved_ip = socket.getaddrinfo(hostname, None)[0][4][0]
    except socket.gaierror as e:
        raise ValueError(f"DNS resolution failed for {hostname}: {e}")

    ip_obj = ipaddress.ip_address(resolved_ip)
    for network in _PRIVATE_NETWORKS:
        if ip_obj in network:
            raise ValueError(
                f"SSRF blocked: {hostname} resolves to private IP {resolved_ip}"
            )


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
                image_url = data["results"][0]["urls"]["regular"]
                _validate_url_not_ssrf(image_url)
                return image_url
    except ValueError:
        raise
    except Exception:
        pass
    return None
