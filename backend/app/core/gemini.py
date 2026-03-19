"""
Gemini API 核心封裝 — google-genai 新版 SDK
支援 gemini-2.0-flash / gemini-3.0-flash 等最新模型
"""
import os, json, asyncio, mimetypes, re
from typing import AsyncIterator, Optional
from google import genai
from google.genai import types

_client: genai.Client | None = None

def init_gemini():
    global _client
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY 未設定")
    _client = genai.Client(api_key=api_key)
    model = os.getenv("GEMINI_MODEL", "gemini-2.0-flash")
    print(f"✅ Gemini client ready（model: {model}）")

def get_client() -> genai.Client:
    if _client is None:
        raise RuntimeError("請先呼叫 init_gemini()")
    return _client

SYSTEM_PROMPT = """你是一個全能的個人 AI 助理，具備以下能力：
1. 幫助用戶管理專案、追蹤任務、分析文件
2. 根據上傳的文件回答問題，並標明出處 [來源: 文件名稱]
3. 生成專案進度報告、會議紀錄摘要
4. 支援用戶透過自然語言執行電腦端操作

當用戶要求建立任務時，請在回應末尾加入：
```task_action
{"action":"create_task","title":"任務標題","description":"說明","priority":"high/medium/low"}
```

當用戶要求執行電腦操作時，請加入：
```agent_action
{"action":"agent_command","command":"自然語言指令"}
```

其餘請用繁體中文，適當使用 Markdown 格式。"""

# ── 串流對話（真正逐 chunk）────────────────────────────────
async def stream_chat(
    messages: list[dict],
    system_prompt: str = None,
    file_uris: list[str] = None,
    model_name: str = None,
) -> AsyncIterator[str]:
    client = get_client()
    model_name = model_name or os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    # 建立 contents
    contents: list[types.Content] = []
    for msg in messages[:-1]:
        role = msg["role"]
        p = msg["parts"][0]
        text = p if isinstance(p, str) else p.get("text", "")
        contents.append(types.Content(role=role, parts=[types.Part(text=text)]))

    last = messages[-1]
    p = last["parts"][0]
    last_text = p if isinstance(p, str) else p.get("text", "")
    last_parts: list[types.Part] = []

    if file_uris:
        for uri in file_uris:
            try:
                f = await asyncio.to_thread(client.files.get, name=uri)
                last_parts.append(types.Part(file_data=types.FileData(
                    file_uri=f.uri, mime_type=f.mime_type)))
            except Exception as e:
                print(f"[Gemini] 檔案載入失敗 {uri}: {e}")

    last_parts.append(types.Part(text=last_text))
    contents.append(types.Content(role="user", parts=last_parts))

    config = types.GenerateContentConfig(
        system_instruction=system_prompt or SYSTEM_PROMPT,
        max_output_tokens=8192,
        temperature=0.7,
    )

    queue: asyncio.Queue = asyncio.Queue()
    loop = asyncio.get_event_loop()

    def _run():
        try:
            for chunk in client.models.generate_content_stream(
                model=model_name, contents=contents, config=config
            ):
                if chunk.text:
                    loop.call_soon_threadsafe(queue.put_nowait, chunk.text)
        except Exception as e:
            loop.call_soon_threadsafe(queue.put_nowait, f"[錯誤] {e}")
        finally:
            loop.call_soon_threadsafe(queue.put_nowait, None)

    loop.run_in_executor(None, _run)
    while True:
        chunk = await queue.get()
        if chunk is None:
            break
        yield chunk

# ── 單次生成 ──────────────────────────────────────────────
async def generate_text(
    prompt: str,
    files: list = None,
    model_name: str = None,
    system: str = None,
) -> str:
    client = get_client()
    model_name = model_name or os.getenv("GEMINI_MODEL", "gemini-2.0-flash")

    parts: list[types.Part] = []
    if files:
        for f in files:
            parts.append(types.Part(file_data=types.FileData(
                file_uri=f.uri, mime_type=f.mime_type)))
    parts.append(types.Part(text=prompt))

    try:
        resp = await asyncio.to_thread(
            client.models.generate_content,
            model=model_name,
            contents=[types.Content(role="user", parts=parts)],
            config=types.GenerateContentConfig(
                system_instruction=system or SYSTEM_PROMPT,
                max_output_tokens=8192,
            ),
        )
        return resp.text or ""
    except Exception as e:
        return f"[Gemini 錯誤] {e}"

# ── 上傳檔案 ──────────────────────────────────────────────
async def upload_file_to_gemini(file_path: str, mime_type: str = None, display_name: str = None):
    client = get_client()
    mime = mime_type or mimetypes.guess_type(file_path)[0] or "application/octet-stream"
    try:
        file_obj = await asyncio.to_thread(
            client.files.upload,
            file=file_path,
            config=types.UploadFileConfig(
                display_name=display_name or os.path.basename(file_path),
                mime_type=mime,
            )
        )
        for _ in range(30):
            f = await asyncio.to_thread(client.files.get, name=file_obj.name)
            if f.state.name == "ACTIVE":
                print(f"[Gemini] 上傳完成: {f.name}")
                return f
            if f.state.name == "FAILED":
                raise Exception(f"處理失敗: {f.name}")
            await asyncio.sleep(2)
        raise Exception("上傳逾時")
    except Exception as e:
        print(f"[Gemini] 上傳失敗: {e}")
        return None

# ── 檔案摘要 ──────────────────────────────────────────────
async def generate_file_summary(file_obj, original_name: str) -> str:
    pro = os.getenv("GEMINI_PRO_MODEL", "gemini-1.5-pro")
    prompt = f"""分析文件「{original_name}」，提供：
1. 類型與主題（1行）
2. 核心摘要（3-5要點）
3. 重要數據或結論
4. 關鍵字（5個以內）
繁體中文，格式清晰。"""
    return await generate_text(prompt, files=[file_obj], model_name=pro)

# ── 提取任務 ──────────────────────────────────────────────
async def extract_tasks_from_text(text: str) -> list[dict]:
    prompt = f"""從以下文字提取所有待辦任務，只回傳 JSON 陣列：

{text[:3000]}

格式：[{{"title":"任務","description":"說明","priority":"high/medium/low","status":"todo"}}]"""
    result = await generate_text(prompt)
    try:
        m = re.search(r'\[[\s\S]*\]', result)
        return json.loads(m.group()) if m else []
    except Exception:
        return []

# ── 生成報告 ──────────────────────────────────────────────
async def generate_project_report(
    project_name: str, tasks: list[dict],
    messages: list[dict], files: list[dict],
    report_type: str = "progress",
) -> str:
    pro = os.getenv("GEMINI_PRO_MODEL", "gemini-1.5-pro")
    type_label = {"progress":"進度報告","meeting":"會議記錄","risk":"風險評估","weekly":"週報"}.get(report_type,"報告")
    todo = sum(1 for t in tasks if t.get("status") == "todo")
    doing = sum(1 for t in tasks if t.get("status") == "in_progress")
    done = sum(1 for t in tasks if t.get("status") == "done")
    prompt = f"""為專案「{project_name}」生成{type_label}。

任務：共{len(tasks)}個，待辦{todo}/進行中{doing}/完成{done}
文件數：{len(files)}
任務清單：{json.dumps([{'title':t.get('title'),'status':t.get('status'),'priority':t.get('priority')} for t in tasks[:20]], ensure_ascii=False)}

繁體中文，Markdown 格式，專業詳細。"""
    return await generate_text(prompt, model_name=pro)
