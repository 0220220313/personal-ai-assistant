#!/bin/bash
# 啟動 Cloudflare Tunnel — 讓 AI 從 Discord 遠端控制你的電腦
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CF="$ROOT/cloudflared"

if [ ! -f "$CF" ]; then
    echo "下載 cloudflared..."
    curl -sL "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64" -o "$CF"
    chmod +x "$CF"
    echo "✅ 下載完成"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Cloudflare Tunnel 啟動中..."
echo "  等出現網址後，把網址傳給 AI（Discord）"
echo "  格式：https://xxxx.trycloudflare.com"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
"$CF" tunnel --url http://localhost:8000 2>&1
