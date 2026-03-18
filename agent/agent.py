"""
Windows 本地 Agent
- 連接後端 WebSocket
- 接收自然語言指令
- 使用 Gemini 解析指令並執行對應工具
- 回報執行結果
"""
import asyncio
import json
import os
import subprocess
import shutil
import glob
from datetime import datetime
from pathlib import Path
from dotenv import load_dotenv
import websockets
import google.generativeai as genai

load_dotenv()

BACKEND_WS = os.getenv("BACKEND_WS_URL", "ws://localhost:8000/api/agent/ws/agent")
AGENT_TOKEN = os.getenv("AGENT_SECRET_TOKEN", "change_this_secret_token")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-2.0-flash")

# ── 可用工具 ──────────────────────────────────────────────
TOOLS_DESCRIPTION = """
你是一個 Windows 電腦端 AI Agent，能執行以下操作：

1. 列出目錄檔案：list_files(path)
2. 建立資料夾：create_folder(path)
3. 移動檔案：move_file(src, dst)
4. 刪除檔案：delete_file(path) 【需謹慎】
5. 執行 PowerShell 指令：run_powershell(command)
6. 搜尋檔案：search_files(pattern, search_path)
7. 讀取檔案內容：read_file(path)
8. 建立文字檔案：write_file(path, content)
9. 取得系統資訊：get_system_info()
10. 開啟應用程式：open_app(app_name)

請根據用戶的自然語言指令，決定要執行哪些操作，並以 JSON 格式回覆：
{
  "plan": "你的執行計劃說明",
  "actions": [
    {"tool": "工具名稱", "params": {"參數名": "值"}},
    ...
  ]
}
只回傳 JSON，不要其他文字。
"""

# ── 工具實作 ──────────────────────────────────────────────
def list_files(path: str) -> str:
    try:
        p = Path(path)
        if not p.exists():
            return f"路徑不存在: {path}"
        items = list(p.iterdir())
        result = []
        for item in sorted(items):
            size = item.stat().st_size if item.is_file() else 0
            result.append(f"{'📁' if item.is_dir() else '📄'} {item.name} ({size} bytes)")
        return "\n".join(result) if result else "（空目錄）"
    except Exception as e:
        return f"錯誤: {e}"

def create_folder(path: str) -> str:
    try:
        Path(path).mkdir(parents=True, exist_ok=True)
        return f"✅ 資料夾已建立: {path}"
    except Exception as e:
        return f"錯誤: {e}"

def move_file(src: str, dst: str) -> str:
    try:
        shutil.move(src, dst)
        return f"✅ 已移動: {src} → {dst}"
    except Exception as e:
        return f"錯誤: {e}"

def delete_file(path: str) -> str:
    try:
        p = Path(path)
        if p.is_dir():
            shutil.rmtree(path)
        else:
            p.unlink()
        return f"✅ 已刪除: {path}"
    except Exception as e:
        return f"錯誤: {e}"

def run_powershell(command: str) -> str:
    try:
        result = subprocess.run(
            ["powershell", "-Command", command],
            capture_output=True, text=True, timeout=30, encoding="utf-8"
        )
        output = result.stdout.strip() or result.stderr.strip()
        return output[:2000] if output else "（無輸出）"
    except subprocess.TimeoutExpired:
        return "❌ 指令執行超時（30秒）"
    except Exception as e:
        return f"錯誤: {e}"

def search_files(pattern: str, search_path: str = "C:\\") -> str:
    try:
        matches = glob.glob(os.path.join(search_path, "**", pattern), recursive=True)
        if not matches:
            return f"找不到符合 '{pattern}' 的檔案"
        return "\n".join(matches[:20]) + (f"\n（僅顯示前20筆，共{len(matches)}個）" if len(matches) > 20 else "")
    except Exception as e:
        return f"錯誤: {e}"

def read_file(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8", errors="ignore") as f:
            content = f.read(5000)
        return content if content else "（空檔案）"
    except Exception as e:
        return f"錯誤: {e}"

def write_file(path: str, content: str) -> str:
    try:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return f"✅ 檔案已寫入: {path}"
    except Exception as e:
        return f"錯誤: {e}"

def get_system_info() -> str:
    try:
        result = subprocess.run(
            ["powershell", "-Command",
             "Get-ComputerInfo | Select-Object CsName,OsName,OsVersion,CsProcessors,CsTotalPhysicalMemory | ConvertTo-Json"],
            capture_output=True, text=True, timeout=15, encoding="utf-8"
        )
        return result.stdout.strip()[:1000]
    except Exception as e:
        return f"錯誤: {e}"

def open_app(app_name: str) -> str:
    try:
        subprocess.Popen(["start", app_name], shell=True)
        return f"✅ 已開啟: {app_name}"
    except Exception as e:
        return f"錯誤: {e}"

TOOL_MAP = {
    "list_files": list_files,
    "create_folder": create_folder,
    "move_file": move_file,
    "delete_file": delete_file,
    "run_powershell": run_powershell,
    "search_files": search_files,
    "read_file": read_file,
    "write_file": write_file,
    "get_system_info": get_system_info,
    "open_app": open_app,
}

# ── 解析並執行指令 ─────────────────────────────────────────
async def process_command(command: str) -> str:
    print(f"\n[Agent] 收到指令: {command}")

    # 請 Gemini 解析指令
    prompt = f"{TOOLS_DESCRIPTION}\n\n用戶指令：{command}"
    try:
        response = model.generate_content(prompt)
        raw = response.text.strip()

        # 提取 JSON
        import re
        json_match = re.search(r'```json\s*([\s\S]*?)\s*```', raw)
        plan_data = json.loads(json_match.group(1) if json_match else raw)
    except Exception as e:
        return f"❌ 指令解析失敗: {e}"

    plan = plan_data.get("plan", "")
    actions = plan_data.get("actions", [])
    print(f"[Agent] 執行計劃: {plan}")
    print(f"[Agent] 動作數量: {len(actions)}")

    results = [f"📋 計劃：{plan}\n"]
    for i, action in enumerate(actions, 1):
        tool_name = action.get("tool", "")
        params = action.get("params", {})
        tool_fn = TOOL_MAP.get(tool_name)

        if not tool_fn:
            results.append(f"{i}. ❌ 未知工具: {tool_name}")
            continue

        print(f"[Agent] 執行 [{i}] {tool_name}({params})")
        try:
            result = tool_fn(**params)
            results.append(f"{i}. **{tool_name}**: {result}")
        except Exception as e:
            results.append(f"{i}. ❌ {tool_name} 失敗: {e}")

    return "\n".join(results)

# ── WebSocket 主循環 ───────────────────────────────────────
async def run_agent():
    ws_url = f"{BACKEND_WS}?token={AGENT_TOKEN}"
    retry_delay = 5

    while True:
        try:
            print(f"[Agent] 連線到後端: {BACKEND_WS}")
            async with websockets.connect(ws_url) as ws:
                print("[Agent] ✅ 已連線！等待指令...")
                retry_delay = 5  # 重置重連延遲

                async for message in ws:
                    try:
                        data = json.loads(message)
                        msg_type = data.get("type")

                        if msg_type == "command":
                            cmd_id = data.get("id")
                            command = data.get("command", "")

                            # 執行指令
                            result = await process_command(command)
                            print(f"[Agent] 執行完成: {result[:100]}...")

                            # 回報結果
                            await ws.send(json.dumps({
                                "type": "result",
                                "id": cmd_id,
                                "result": result,
                                "status": "done"
                            }, ensure_ascii=False))

                        elif msg_type == "ping":
                            await ws.send(json.dumps({"type": "pong"}))

                    except json.JSONDecodeError:
                        pass
                    except Exception as e:
                        print(f"[Agent] 處理訊息錯誤: {e}")
                        if 'cmd_id' in locals():
                            await ws.send(json.dumps({
                                "type": "result",
                                "id": cmd_id,
                                "result": f"❌ 執行錯誤: {e}",
                                "status": "error"
                            }))

        except (ConnectionRefusedError, OSError) as e:
            print(f"[Agent] 連線失敗: {e}，{retry_delay}秒後重試...")
            await asyncio.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, 60)
        except Exception as e:
            print(f"[Agent] 意外錯誤: {e}，{retry_delay}秒後重試...")
            await asyncio.sleep(retry_delay)

if __name__ == "__main__":
    print("=" * 50)
    print("  個人 AI 助理 - Windows Agent")
    print("=" * 50)
    asyncio.run(run_agent())
