"""
Gemini API 核心封裝
支援：串流對話、多輪記憶、檔案分析、知識庫問答
"""
import os
import json
import asyncio
from typing import AsyncIterator, Optional
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

# ── 初始化 ────────────────────────────────────────────
def init_gemini():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY 未設定")
    genai.configure(api_key=api_key)

SAFETY_SETTINGS = {
    HarmCategory.HARM_CATEGORY_HARASSMENT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_HATE_SPEECH: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT: HarmBlockThreshold.BLOCK_NONE,
    HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT: HarmBlockThreshold.BLOCK_NONE,
}

SYSTEM_PROMPT = """你是一個全能的個人 AI 助理，具備以下能力：
1. 幫助用戶管理專案、追蹤任務、分析文件
2. 根據上傳的文件回答問題，並標明出處
3. 生成專案進度報告、會議紀錄摘要
4. 執行用戶透過手機發出的電腦端指令

回答時請：
- 使用繁體中文
- 結構清晰，適當使用 Markdown 格式
- 引用文件內容時標明 [來源: 文件名稱]
- 生成任務清單時使用 JSON 格式包裹以便系統解析"""

# ── 基礎對話（串流）────────────────────────────────────
async def stream_chat(
    messages: list[dict],
    system_prompt: str = SYSTEM_PROMPT,
    model_name: str = None,
    files: list = None
) -> AsyncIterator[str]:
    """
    串流對話
    messages: [{"role": "user"/"model", "parts": ["text"]}]
    files: Gemini File API 上傳後的 file 物件列表
    """
    model_name = model_name or os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    model = genai.GenerativeModel(
        model_name=model_name,
        system_instruction=system_prompt,
        safety_settings=SAFETY_SETTINGS
    )

    # 分離歷史與最新訊息
    history = messages[:-1] if len(messages) > 1 else []
    last_message = messages[-1] if messages else None
    if not last_message:
        return

    chat = model.start_chat(history=history)

    # 組合最新訊息（可能含檔案）
    parts = []
    if files:
        parts.extend(files)
    if isinstance(last_message.get("parts"), list):
        parts.extend(last_message["parts"])
    else:
        parts.append(last_message.get("parts", ""))

    # 串流回覆
    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: chat.send_message(parts, stream=True)
    )

    for chunk in response:
        if chunk.text:
            yield chunk.text

# ── 單次生成（非串流，用於後台任務）──────────────────────
async def generate_text(
    prompt: str,
    context: str = "",
    model_name: str = None,
    files: list = None
) -> str:
    model_name = model_name or os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    model = genai.GenerativeModel(
        model_name=model_name,
        system_instruction=SYSTEM_PROMPT,
        safety_settings=SAFETY_SETTINGS
    )

    parts = []
    if files:
        parts.extend(files)
    if context:
        parts.append(f"背景資訊：\n{context}\n\n")
    parts.append(prompt)

    loop = asyncio.get_event_loop()
    response = await loop.run_in_executor(
        None,
        lambda: model.generate_content(parts)
    )
    return response.text

# ── 上傳檔案到 Gemini File API ──────────────────────────
async def upload_file_to_gemini(file_path: str, mime_type: str, display_name: str = None) -> dict:
    """
    上傳檔案到 Gemini File API
    回傳: {"uri": str, "name": str, "mime_type": str}
    """
    loop = asyncio.get_event_loop()

    def _upload():
        f = genai.upload_file(
            path=file_path,
            mime_type=mime_type,
            display_name=display_name or os.path.basename(file_path)
        )
        # 等待處理完成
        while f.state.name == "PROCESSING":
            import time
            time.sleep(2)
            f = genai.get_file(f.name)
        return f

    file_obj = await loop.run_in_executor(None, _upload)
    return {
        "uri": file_obj.uri,
        "name": file_obj.name,
        "mime_type": file_obj.mime_type
    }

# ── 從 URI 取得 Gemini File 物件 ────────────────────────
def get_gemini_file(uri: str):
    """從儲存的 URI 重建 Gemini file part"""
    return {"file_data": {"mime_type": "application/octet-stream", "file_uri": uri}}

# ── 自動生成文件摘要 ─────────────────────────────────────
async def generate_file_summary(file_obj, filename: str) -> str:
    model_name = os.getenv("GEMINI_PRO_MODEL", "gemini-1.5-pro")
    prompt = f"""請分析這份文件「{filename}」並生成：
1. **文件摘要**（3-5句話）
2. **主要重點**（條列式，最多8點）
3. **關鍵詞**（5-10個）

請用繁體中文回答，格式使用 Markdown。"""

    return await generate_text(prompt, files=[file_obj], model_name=model_name)

# ── AI 自動從對話提取任務 ────────────────────────────────
async def extract_tasks_from_text(text: str) -> list[dict]:
    prompt = f"""從以下文字中提取所有任務項目。

文字內容：
{text}

請以 JSON 格式回傳任務列表，格式如下：
```json
[
  {{
    "title": "任務標題",
    "description": "任務描述",
    "priority": "high/medium/low",
    "due_date": "YYYY-MM-DD 或空字串"
  }}
]
```

若無任務則回傳空陣列 []。只回傳 JSON，不要其他文字。"""

    result = await generate_text(prompt)
    try:
        # 提取 JSON 部分
        import re
        json_match = re.search(r'```json\s*([\s\S]*?)\s*```', result)
        if json_match:
            return json.loads(json_match.group(1))
        return json.loads(result.strip())
    except Exception:
        return []

# ── 生成專案報告 ─────────────────────────────────────────
async def generate_project_report(
    project_name: str,
    report_type: str,
    context: str,
    files: list = None
) -> str:
    prompts = {
        "progress": f"請為專案「{project_name}」生成進度報告，包含：完成項目、進行中項目、待辦事項、風險評估。",
        "meeting": f"請整理以下會議內容，生成會議紀錄，包含：出席者、討論重點、決議事項、後續行動項目。",
        "risk": f"請分析專案「{project_name}」的潛在風險，並提供風險等級評估與建議對策。",
        "weekly": f"請為專案「{project_name}」生成本週工作週報，格式包含：本週完成事項、下週計畫、需要協助事項。",
    }

    prompt = prompts.get(report_type, prompts["progress"])
    full_prompt = f"{prompt}\n\n專案資訊：\n{context}"

    return await generate_text(full_prompt, files=files,
                               model_name=os.getenv("GEMINI_PRO_MODEL", "gemini-1.5-pro"))
