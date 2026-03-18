"""
WSL Agent — 從 WSL 執行，透過 powershell.exe / cmd.exe 控制 Windows
"""
import asyncio
import json
import os
import re
import subprocess
import shutil
import glob
import platform
from pathlib import Path
from dotenv import load_dotenv
import websockets
import google.generativeai as genai

load_dotenv()

BACKEND_WS     = os.getenv("BACKEND_WS_URL", "ws://localhost:8000/api/agent/ws/agent")
AGENT_TOKEN    = os.getenv("AGENT_SECRET_TOKEN", "change_this_secret_token")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

genai.configure(api_key=GEMINI_API_KEY)
model = genai.GenerativeModel("gemini-2.0-flash")

# ── 偵測 WSL 環境 ─────────────────────────────────────────
def is_wsl() -> bool:
    try:
        with open("/proc/version") as f:
            return "microsoft" in f.read().lower()
    except Exception:
        return False

IN_WSL = is_wsl()

def ps_exe():
    return "powershell.exe" if IN_WSL else "powershell"

def win_to_wsl(path: str) -> str:
    if len(path) >= 3 and path[1] == ":" and path[2] in ("/", "\\"):
        drive = path[0].lower()
        rest  = path[2:].replace("\\", "/")
        return f"/mnt/{drive}{rest}"
    return path

def _norm(path: str) -> str:
    """統一成 WSL 可用路徑"""
    path = path.replace("\\", "/")
    if IN_WSL and len(path) >= 2 and path[1] == ":":
        return win_to_wsl(path)
    return path

# ── Gemini 工具描述 ───────────────────────────────────────
TOOLS_DESCRIPTION = """
你是電腦端 AI Agent，可執行下列工具：

1. list_files(path) — 列出目錄內容
2. create_folder(path) — 建立資料夾
3. move_file(src, dst) — 移動/重新命名
4. delete_file(path) — 刪除檔案或資料夾
5. run_powershell(command) — 執行 PowerShell 指令（可操控 Windows）
6. search_files(pattern, search_path) — 搜尋檔案，pattern 如 *.pdf
7. read_file(path) — 讀取檔案
8. write_file(path, content) — 寫入檔案
9. get_system_info() — 取得系統資訊
10. open_app(app_name) — 開啟 Windows 應用程式（如 notepad、chrome）

路徑可用 WSL 格式（/mnt/c/Users/...）或 Windows 格式（C:/Users/...）

只回傳 JSON，不加任何 markdown：
{"plan": "說明", "actions": [{"tool": "名稱", "params": {"key": "value"}}]}
"""

# ── 工具實作 ──────────────────────────────────────────────
def list_files(path: str) -> str:
    path = _norm(path)
    try:
        p = Path(path)
        if not p.exists():
            return f"路徑不存在: {path}"
        items = sorted(p.iterdir())
        lines = [f"{'📁' if i.is_dir() else '📄'} {i.name}" + (f"  ({i.stat().st_size:,} bytes)" if i.is_file() else "") for i in items]
        return "\n".join(lines) or "（空目錄）"
    except Exception as e:
        return f"錯誤: {e}"

def create_folder(path: str) -> str:
    path = _norm(path)
    try:
        Path(path).mkdir(parents=True, exist_ok=True)
        return f"✅ 建立: {path}"
    except Exception as e:
        return f"錯誤: {e}"

def move_file(src: str, dst: str) -> str:
    try:
        shutil.move(_norm(src), _norm(dst))
        return f"✅ 移動完成"
    except Exception as e:
        return f"錯誤: {e}"

def delete_file(path: str) -> str:
    path = _norm(path)
    try:
        p = Path(path)
        shutil.rmtree(path) if p.is_dir() else p.unlink()
        return f"✅ 已刪除: {path}"
    except Exception as e:
        return f"錯誤: {e}"

def run_powershell(command: str) -> str:
    try:
        r = subprocess.run([ps_exe(), "-Command", command],
                           capture_output=True, text=True, timeout=30,
                           encoding="utf-8", errors="replace")
        out = r.stdout.strip() or r.stderr.strip()
        return out[:3000] or "（無輸出）"
    except subprocess.TimeoutExpired:
        return "❌ 超時（30s）"
    except FileNotFoundError:
        return f"❌ 找不到 {ps_exe()}"
    except Exception as e:
        return f"錯誤: {e}"

def search_files(pattern: str, search_path: str = "/mnt/c/Users") -> str:
    search_path = _norm(search_path)
    try:
        matches = glob.glob(os.path.join(search_path, "**", pattern), recursive=True)
        if not matches:
            return f"找不到 '{pattern}'"
        result = "\n".join(matches[:20])
        if len(matches) > 20:
            result += f"\n...共 {len(matches)} 筆，顯示前 20"
        return result
    except Exception as e:
        return f"錯誤: {e}"

def read_file(path: str) -> str:
    path = _norm(path)
    try:
        with open(path, encoding="utf-8", errors="ignore") as f:
            return f.read(5000) or "（空檔案）"
    except Exception as e:
        return f"錯誤: {e}"

def write_file(path: str, content: str) -> str:
    path = _norm(path)
    try:
        Path(path).parent.mkdir(parents=True, exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        return f"✅ 已寫入: {path}"
    except Exception as e:
        return f"錯誤: {e}"

def get_system_info() -> str:
    try:
        r = subprocess.run(
            [ps_exe(), "-Command",
             "$i=Get-ComputerInfo -Property CsName,OsName,CsProcessors,CsTotalPhysicalMemory; "
             "[pscustomobject]@{Computer=$i.CsName; OS=$i.OsName; "
             "CPU=($i.CsProcessors|Select -First 1 -Expand Name); "
             "RAM_GB=[math]::Round($i.CsTotalPhysicalMemory/1GB,1)} | ConvertTo-Json"],
            capture_output=True, text=True, timeout=20,
            encoding="utf-8", errors="replace")
        return r.stdout.strip()[:1000] or f"WSL: {platform.uname()}"
    except Exception as e:
        return f"WSL: {platform.uname()}\n(Windows 資訊失敗: {e})"

def open_app(app_name: str) -> str:
    try:
        if IN_WSL:
            subprocess.Popen(["cmd.exe", "/c", "start", "", app_name],
                             stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        else:
            subprocess.Popen(["start", app_name], shell=True)
        return f"✅ 已開啟: {app_name}"
    except Exception as e:
        return f"錯誤: {e}"

TOOL_MAP = {
    "list_files": list_files, "create_folder": create_folder,
    "move_file": move_file, "delete_file": delete_file,
    "run_powershell": run_powershell, "search_files": search_files,
    "read_file": read_file, "write_file": write_file,
    "get_system_info": get_system_info, "open_app": open_app,
}

# ── 核心：解析並執行 ──────────────────────────────────────
async def process_command(command: str) -> str:
    print(f"\n[Agent] 指令: {command}")
    prompt = f"{TOOLS_DESCRIPTION}\n\n用戶指令：{command}"
    raw = ""
    try:
        response = model.generate_content(prompt)
        raw = response.text.strip()
        m = re.search(r'```(?:json)?\s*([\s\S]*?)\s*```', raw)
        plan_data = json.loads(m.group(1) if m else raw)
    except Exception as e:
        return f"❌ 解析失敗: {e}\n原始: {raw[:300]}"

    plan    = plan_data.get("plan", "")
    actions = plan_data.get("actions", [])
    print(f"[Agent] 計劃: {plan} | {len(actions)} 個動作")

    results = [f"📋 **計劃**：{plan}"]
    for i, action in enumerate(actions, 1):
        name   = action.get("tool", "")
        params = action.get("params", {})
        fn     = TOOL_MAP.get(name)
        if not fn:
            results.append(f"{i}. ❌ 未知工具: {name}")
            continue
        print(f"[Agent] [{i}] {name}({params})")
        try:
            results.append(f"{i}. **{name}**\n{fn(**params)}")
        except Exception as e:
            results.append(f"{i}. ❌ {name}: {e}")

    return "\n\n".join(results)

# ── WebSocket 主循環 ───────────────────────────────────────
async def run_agent():
    ws_url = f"{BACKEND_WS}?token={AGENT_TOKEN}"
    retry_delay = 5
    while True:
        try:
            print(f"\n[Agent] 連線: {BACKEND_WS}")
            async with websockets.connect(ws_url) as ws:
                print("[Agent] ✅ 已連線，等待指令...")
                retry_delay = 5
                cmd_id = None
                async for msg in ws:
                    try:
                        data = json.loads(msg)
                        if data.get("type") == "command":
                            cmd_id = data.get("id")
                            result = await process_command(data.get("command", ""))
                            await ws.send(json.dumps({"type": "result", "id": cmd_id, "result": result, "status": "done"}, ensure_ascii=False))
                        elif data.get("type") == "ping":
                            await ws.send(json.dumps({"type": "pong"}))
                    except json.JSONDecodeError:
                        pass
                    except Exception as e:
                        print(f"[Agent] 錯誤: {e}")
                        if cmd_id:
                            await ws.send(json.dumps({"type": "result", "id": cmd_id, "result": f"❌ {e}", "status": "error"}))
        except (ConnectionRefusedError, OSError) as e:
            print(f"[Agent] 連線失敗: {e}，{retry_delay}s 後重試")
            await asyncio.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, 60)
        except Exception as e:
            print(f"[Agent] 錯誤: {e}，{retry_delay}s 後重試")
            await asyncio.sleep(retry_delay)

if __name__ == "__main__":
    print("=" * 50)
    print("  Personal AI Assistant — Agent")
    print(f"  環境: {'WSL → 控制 Windows' if IN_WSL else 'Windows Native'}")
    print("=" * 50)
    asyncio.run(run_agent())
