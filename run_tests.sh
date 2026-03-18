#!/bin/bash
# 執行所有測試

set -e
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOLD='\033[1m'; GREEN='\033[0;32m'; RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo -e "${BOLD}=== Personal AI Assistant — 自動化測試 ===${NC}\n"

# ── 1. TypeScript 型別檢查 ──────────────────────────────
echo -e "${BOLD}[1/2] TypeScript 型別檢查${NC}"
cd "$ROOT/frontend"
if npx tsc --noEmit 2>&1; then
    echo -e "${GREEN}✅ TypeScript：無錯誤${NC}\n"
else
    echo -e "${RED}❌ TypeScript 有型別錯誤${NC}\n"
    exit 1
fi

# ── 2. 後端 Python 測試 ──────────────────────────────────
echo -e "${BOLD}[2/2] 後端 API 測試 (pytest)${NC}"
cd "$ROOT/backend"

# 找 conda python
for PY in \
    "$HOME/anaconda3/envs/ai-assistant/bin/python3" \
    "$HOME/miniconda3/envs/ai-assistant/bin/python3" \
    "$(conda run -n ai-assistant which python3 2>/dev/null)"; do
    [ -x "$PY" ] && break
done

if [ -x "$PY" ]; then
    $PY -m pytest tests/ -v --tb=short 2>&1
else
    echo -e "${YELLOW}⚠️  找不到 ai-assistant conda 環境，跳過後端測試${NC}"
    echo "請先執行：conda activate ai-assistant && pip install pytest pytest-asyncio httpx"
fi

echo -e "\n${GREEN}${BOLD}✅ 測試完成！${NC}"
