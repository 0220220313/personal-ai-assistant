#!/bin/bash
# ═══════════════════════════════════════════════════
#  Personal AI Assistant — 一鍵啟動所有服務
# ═══════════════════════════════════════════════════

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── 顏色輸出 ──
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
log()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }
info() { echo -e "${CYAN}[i]${NC} $1"; }

echo -e "${BOLD}"
echo "╔══════════════════════════════════════════╗"
echo "║   Personal AI Assistant — 啟動中...     ║"
echo "╚══════════════════════════════════════════╝"
echo -e "${NC}"

# ── 1. 檢查 .env ──────────────────────────────────
if [ ! -f "$ROOT/backend/.env" ]; then
    warn "backend/.env 不存在，從範本建立..."
    cp "$ROOT/backend/.env.example" "$ROOT/backend/.env"
    err "請先編輯 backend/.env 填入 GEMINI_API_KEY："
    echo "    nano $ROOT/backend/.env"
    exit 1
fi

if grep -q "your_gemini_api_key_here" "$ROOT/backend/.env" 2>/dev/null; then
    err "請先在 backend/.env 填入你的 GEMINI_API_KEY！"
    echo "    nano $ROOT/backend/.env"
    exit 1
fi

# ── 2. 找 conda Python ────────────────────────────
find_python() {
    for candidate in \
        "$HOME/anaconda3/envs/ai-assistant/bin/python3" \
        "$HOME/miniconda3/envs/ai-assistant/bin/python3" \
        "$HOME/miniforge3/envs/ai-assistant/bin/python3" \
        "$HOME/.conda/envs/ai-assistant/bin/python3"; do
        [ -x "$candidate" ] && echo "$candidate" && return 0
    done
    # fallback: conda run
    if command -v conda &>/dev/null; then
        echo "conda_run"
        return 0
    fi
    echo ""
}

PYTHON=$(find_python)
if [ -z "$PYTHON" ]; then
    err "找不到 ai-assistant conda 環境！請先執行："
    echo "    conda create -n ai-assistant python=3.11 -y"
    echo "    conda activate ai-assistant"
    echo "    pip install -r backend/requirements.txt"
    exit 1
fi

if [ "$PYTHON" = "conda_run" ]; then
    PYTHON_CMD="conda run -n ai-assistant python3"
    UVICORN_CMD="conda run -n ai-assistant uvicorn"
else
    PYTHON_CMD="$PYTHON"
    UVICORN_DIR="$(dirname $PYTHON)"
    UVICORN_CMD="$UVICORN_DIR/uvicorn"
fi

log "Python: $PYTHON_CMD"

# ── 3. 檢查 node_modules ─────────────────────────
if [ ! -d "$ROOT/frontend/node_modules" ]; then
    warn "frontend/node_modules 不存在，執行 npm install..."
    cd "$ROOT/frontend" && npm install --silent
    log "前端套件安裝完成"
fi

# ── 4. 建立 log 目錄 ──────────────────────────────
mkdir -p "$ROOT/logs"

# ── 5. 用 tmux 還是一般背景程序？────────────────
USE_TMUX=false
if command -v tmux &>/dev/null; then
    USE_TMUX=true
fi

start_services_tmux() {
    SESSION="ai-assistant"
    # 如果 session 已存在，先刪除
    tmux kill-session -t "$SESSION" 2>/dev/null || true
    sleep 0.3

    tmux new-session -d -s "$SESSION" -x 220 -y 50

    # 視窗 0：後端
    tmux rename-window -t "$SESSION:0" "Backend"
    tmux send-keys -t "$SESSION:0" \
        "cd '$ROOT/backend' && $UVICORN_CMD app.main:app --host 0.0.0.0 --port 8000 --reload 2>&1 | tee '$ROOT/logs/backend.log'" Enter

    # 視窗 1：前端
    tmux new-window -t "$SESSION:1" -n "Frontend"
    tmux send-keys -t "$SESSION:1" \
        "cd '$ROOT/frontend' && npm run dev 2>&1 | tee '$ROOT/logs/frontend.log'" Enter

    # 視窗 2：Agent
    tmux new-window -t "$SESSION:2" -n "Agent"
    if [ -f "$ROOT/agent/.env" ]; then
        tmux send-keys -t "$SESSION:2" \
            "cd '$ROOT/agent' && $PYTHON_CMD agent.py 2>&1 | tee '$ROOT/logs/agent.log'" Enter
    else
        tmux send-keys -t "$SESSION:2" \
            "echo '⚠️  agent/.env 不存在，複製範本後填入 GEMINI_API_KEY 和 AGENT_SECRET_TOKEN'" Enter
        tmux send-keys -t "$SESSION:2" \
            "cp '$ROOT/agent/.env.example' '$ROOT/agent/.env' && nano '$ROOT/agent/.env'" Enter
    fi

    # 視窗 3：監控 (日誌)
    tmux new-window -t "$SESSION:3" -n "Logs"
    tmux send-keys -t "$SESSION:3" \
        "tail -f '$ROOT/logs/backend.log' '$ROOT/logs/frontend.log' '$ROOT/logs/agent.log' 2>/dev/null" Enter

    # 切回視窗 0
    tmux select-window -t "$SESSION:0"

    echo ""
    log "所有服務已在 tmux session 啟動！"
    echo ""
    echo -e "  ${BOLD}tmux 視窗：${NC}"
    echo "    [0] Backend  — FastAPI on :8000"
    echo "    [1] Frontend — Next.js on :3000"
    echo "    [2] Agent    — WSL → Windows"
    echo "    [3] Logs     — 即時日誌"
    echo ""
    echo -e "  ${BOLD}進入 tmux：${NC}"
    echo "    tmux attach -t $SESSION"
    echo ""
    echo -e "  ${BOLD}切換視窗：${NC} Ctrl+B，然後按 0/1/2/3"
    echo -e "  ${BOLD}離開 tmux：${NC} Ctrl+B，然後按 D（服務繼續在背景跑）"
    echo ""
    echo -e "${GREEN}🌐 前端網址：${BOLD}http://localhost:3000${NC}"
    echo ""
    read -p "按 Enter 進入 tmux，或 Ctrl+C 讓服務在背景繼續執行..."
    tmux attach -t "$SESSION"
}

start_services_bg() {
    # 停止舊程序
    pkill -f "uvicorn app.main:app" 2>/dev/null || true
    pkill -f "next dev" 2>/dev/null || true
    pkill -f "agent/agent.py" 2>/dev/null || true
    sleep 1

    info "以背景程序啟動（建議安裝 tmux 獲得更好體驗）"

    # 後端
    cd "$ROOT/backend"
    nohup $UVICORN_CMD app.main:app --host 0.0.0.0 --port 8000 --reload \
        > "$ROOT/logs/backend.log" 2>&1 &
    BACKEND_PID=$!
    log "後端已啟動 (PID: $BACKEND_PID) → logs/backend.log"

    # 前端
    cd "$ROOT/frontend"
    nohup npm run dev > "$ROOT/logs/frontend.log" 2>&1 &
    FRONTEND_PID=$!
    log "前端已啟動 (PID: $FRONTEND_PID) → logs/frontend.log"

    # Agent（如有 .env）
    if [ -f "$ROOT/agent/.env" ]; then
        cd "$ROOT/agent"
        nohup $PYTHON_CMD agent.py > "$ROOT/logs/agent.log" 2>&1 &
        AGENT_PID=$!
        log "Agent 已啟動 (PID: $AGENT_PID) → logs/agent.log"
    else
        warn "agent/.env 不存在，跳過 Agent 啟動"
        warn "請複製並編輯：cp agent/.env.example agent/.env"
    fi

    # 儲存 PID
    echo "BACKEND_PID=$BACKEND_PID" > "$ROOT/logs/pids"
    echo "FRONTEND_PID=$FRONTEND_PID" >> "$ROOT/logs/pids"

    echo ""
    echo -e "${GREEN}🌐 前端網址：${BOLD}http://localhost:3000${NC}"
    echo ""
    echo "查看即時日誌："
    echo "  tail -f logs/backend.log"
    echo "  tail -f logs/frontend.log"
    echo "  tail -f logs/agent.log"
    echo ""
    echo "停止所有服務：bash stop.sh"
}

if $USE_TMUX; then
    start_services_tmux
else
    start_services_bg
fi
