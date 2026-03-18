#!/bin/bash
echo "停止所有服務..."
pkill -f "uvicorn app.main:app" 2>/dev/null && echo "✅ 後端已停止" || echo "後端未運行"
pkill -f "next dev"             2>/dev/null && echo "✅ 前端已停止" || echo "前端未運行"
pkill -f "agent/agent.py"       2>/dev/null && echo "✅ Agent 已停止" || echo "Agent 未運行"
# 如有 tmux session
tmux kill-session -t ai-assistant 2>/dev/null && echo "✅ tmux session 已關閉" || true
echo "完成。"
