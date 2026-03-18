@echo off
chcp 65001 > nul
title 個人AI助理 - Windows Agent
echo ========================================
echo   個人 AI 助理 - Windows Agent 啟動中
echo ========================================

:: 切換到 agent 目錄
cd /d "%~dp0"

:: 啟動 Agent
python agent.py

pause
