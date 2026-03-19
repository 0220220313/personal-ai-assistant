#!/bin/bash
set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════╗"
echo "║   Personal AI Assistant — 啟動中...     ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. 檢查 .env ──
if [ ! -f "$ROOT/backend/.env" ]; then
    cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
    err "請先編輯 backend/.env 填入 GEMINI_API_KEY：  nano $ROOT/backend/.env"
    exit 1
fi
if grep -q "your_gemini_api_key_here" "$ROOT/backend/.env" 2>/dev/null; then
    err "請填入 GEMINI_API_KEY！  nano $ROOT/backend/.env"
    exit 1
fi

# ── 2. 找 Python ──
find_python() {
    for p in \
        "$HOME/miniconda3/envs/ai-assistant/bin/python3" \
        "$HOME/anaconda3/envs/ai-assistant/bin/python3" \
        "$HOME/miniforge3/envs/ai-assistant/bin/python3"; do
        [ -x "$p" ] && echo "$p" && return
    done
    command -v conda &>/dev/null && echo "conda_run" && return
    echo ""
}
PYTHON=$(find_python)
if [ -z "$PYTHON" ]; then
    err "找不到 ai-assistant conda 環境！請執行："
    echo "  conda create -n ai-assistant python=3.11 -y"
    echo "  conda activate ai-assistant"
    echo "  pip install -r backend/requirements.txt"
    exit 1
fi
if [ "$PYTHON" = "conda_run" ]; then
    UVICORN_CMD="conda run -n ai-assistant uvicorn"
    PYTHON_CMD="conda run -n ai-assistant python3"
else
    BIN="$(dirname $PYTHON)"
    UVICORN_CMD="$BIN/uvicorn"
    PYTHON_CMD="$PYTHON"
fi
log "Python: $PYTHON_CMD"

# ── 3. 安裝前端依賴 ──
if [ ! -d "$ROOT/frontend/node_modules" ]; then
    warn "安裝前端套件..."
    cd "$ROOT/frontend" && npm install --silent
    log "前端套件安裝完成"
fi

mkdir -p "$ROOT/logs"

# ── 4. 用 tmux 或背景程序啟動 ──
if command -v tmux &>/dev/null; then
    SESSION="ai-assistant"
    tmux kill-session -t "$SESSION" 2>/dev/null || true
    sleep 0.3
    tmux new-session -d -s "$SESSION" -x 220 -y 50

    # 後端（帶自動重啟 while loop）
    tmux rename-window -t "$SESSION:0" "Backend"
    tmux send-keys -t "$SESSION:0" \
      "while true; do cd '$ROOT/backend' && $UVICORN_CMD app.main:app --host 0.0.0.0 --port 8000 --reload 2>&1 | tee '$ROOT/logs/backend.log'; echo '⚠️  後端崩潰，3s 後重啟...'; sleep 3; done" Enter

    # 前端
    tmux new-window -t "$SESSION:1" -n "Frontend"
    tmux send-keys -t "$SESSION:1" \
      "cd '$ROOT/frontend' && npm run dev 2>&1 | tee '$ROOT/logs/frontend.log'" Enter

    # Agent
    tmux new-window -t "$SESSION:2" -n "Agent"
    if [ -f "$ROOT/agent/.env" ]; then
        tmux send-keys -t "$SESSION:2" \
          "while true; do cd '$ROOT/agent' && $PYTHON_CMD agent.py 2>&1 | tee '$ROOT/logs/agent.log'; echo '⚠️  Agent 崩潰，3s 後重啟...'; sleep 3; done" Enter
    else
        tmux send-keys -t "$SESSION:2" \
          "cp '$ROOT/agent/.env.example' '$ROOT/agent/.env' && nano '$ROOT/agent/.env'" Enter
    fi

    # Logs
    tmux new-window -t "$SESSION:3" -n "Logs"
    tmux send-keys -t "$SESSION:3" \
      "tail -f '$ROOT/logs/backend.log' '$ROOT/logs/frontend.log' 2>/dev/null" Enter

    tmux select-window -t "$SESSION:0"
    log "所有服務已在 tmux 啟動（含自動重啟）"
    echo ""
    echo -e "  ${BOLD}指令：${NC}"
    echo "    tmux attach -t $SESSION  # 進入控制台"
    echo "    切換視窗：Ctrl+B 再按 0/1/2/3"
    echo "    離開：Ctrl+B 再按 D"
    echo ""
    echo -e "${GREEN}🌐 http://localhost:3000${NC}"
    echo ""
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BOLD}  讓 AI 從 Discord 遠端控制：${NC}"
    echo -e "  新終端機執行：${BOLD}bash tunnel.sh${NC}"
    echo -e "  把產生的 https:// 網址傳給 AI"
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    read -p "按 Enter 進入 tmux..." 2>/dev/null && tmux attach -t "$SESSION"
else
    # 背景程序模式
    pkill -f "uvicorn app.main:app" 2>/dev/null || true
    pkill -f "next dev" 2>/dev/null || true
    pkill -f "agent/agent.py" 2>/dev/null || true
    sleep 1

    (while true; do cd "$ROOT/backend" && $UVICORN_CMD app.main:app --host 0.0.0.0 --port 8000 --reload >> "$ROOT/logs/backend.log" 2>&1; sleep 3; done) &
    log "後端已啟動（自動重啟）→ logs/backend.log"

    (cd "$ROOT/frontend" && npm run dev >> "$ROOT/logs/frontend.log" 2>&1) &
    log "前端已啟動 → logs/frontend.log"

    if [ -f "$ROOT/agent/.env" ]; then
        (while true; do cd "$ROOT/agent" && $PYTHON_CMD agent.py >> "$ROOT/logs/agent.log" 2>&1; sleep 3; done) &
        log "Agent 已啟動（自動重啟）→ logs/agent.log"
    fi

    echo ""
    echo -e "${GREEN}🌐 http://localhost:3000${NC}"
    echo "停止：bash stop.sh | 查 log：tail -f logs/backend.log"
fi
