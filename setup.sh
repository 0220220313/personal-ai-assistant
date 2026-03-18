#!/bin/bash
# 一鍵環境建置腳本（在 WSL 中執行）

set -e
echo "======================================"
echo "  個人 AI 助理 - 環境建置"
echo "======================================"

PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$PROJECT_DIR"

# ── 後端環境 ───────────────────────────────
echo ""
echo "📦 建立 Python 環境..."
conda create -n ai-assistant python=3.11 -y
source activate ai-assistant || conda activate ai-assistant

echo "📦 安裝後端依賴..."
cd backend
pip install -r requirements.txt

echo "⚙️  設定後端環境變數..."
if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ 已建立 backend/.env，請編輯填入 GEMINI_API_KEY"
fi
cd ..

# ── 前端環境 ──────────────────────────────
echo ""
echo "📦 安裝前端依賴..."
cd frontend
npm install

if [ ! -f .env.local ]; then
  cp .env.local.example .env.local
  echo "✅ 已建立 frontend/.env.local"
fi
cd ..

# ── Agent 環境 ────────────────────────────
echo ""
echo "📦 安裝 Agent 依賴..."
cd agent
pip install -r requirements.txt

if [ ! -f .env ]; then
  cp .env.example .env
  echo "✅ 已建立 agent/.env，請編輯填入 GEMINI_API_KEY"
fi
cd ..

echo ""
echo "======================================"
echo "✅ 環境建置完成！"
echo ""
echo "🚀 啟動步驟："
echo "  1. 編輯 backend/.env 填入 GEMINI_API_KEY"
echo "  2. cd backend && uvicorn app.main:app --reload"
echo "  3. cd frontend && npm run dev"
echo "  4. Windows 上執行 agent/start.bat"
echo "======================================"
