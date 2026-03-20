from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import io, uuid, json, logging, re
from datetime import datetime
from pydantic import BaseModel
from typing import Optional, List

from ..db.database import get_db
from ..db.models import Project, File
from ..core.gemini import generate_text

router = APIRouter(prefix="/slides", tags=["slides"])
logger = logging.getLogger(__name__)

# In-memory presentation store (keyed by pres_id and "list_{project_id}")
_store: dict = {}


class GenerateRequest(BaseModel):
    topic: str
    num_slides: int = 8
    template: str = "professional"
    extra_context: str = ""
    file_ids: List[str] = []


PROMPT_TMPL = """你是一位專業的簡報設計師。請根據以下資訊生成一份完整的簡報。

主題：{topic}
投影片數量：{num_slides}
{extra}

回應格式（純 JSON，不含任何說明文字）：
{{
  "title": "簡報標題",
  "subtitle": "副標題",
  "slides": [
    {{
      "id": "1",
      "type": "title",
      "title": "投影片標題",
      "subtitle": "副標題（title類型用）",
      "content": [],
      "notes": "備注"
    }},
    {{
      "id": "2",
      "type": "content",
      "title": "投影片標題",
      "content": ["要點一（不超過20字）", "要點二", "要點三"],
      "notes": "備注"
    }},
    {{
      "id": "3",
      "type": "two_column",
      "title": "比較/對比標題",
      "left_title": "左欄標題",
      "left_content": ["左1", "左2"],
      "right_title": "右欄標題",
      "right_content": ["右1", "右2"],
      "notes": "備注"
    }}
  ]
}}

規則：
- 使用繁體中文
- 第一張必須是 title 類型
- 最後一張可以是總結或 Q&A
- 每張 content 最多 5 個要點，每點不超過 20 字
- 只回傳 JSON，不要 markdown 代碼塊"""


@router.post("/{project_id}/generate")
async def generate_slides(
    project_id: str,
    req: GenerateRequest,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Project).where(Project.id == project_id))
    if not result.scalar_one_or_none():
        raise HTTPException(404, "Project not found")

    extra = ""
    if req.extra_context:
        extra += f"額外說明：{req.extra_context}\n"
    if req.file_ids:
        fres = await db.execute(select(File).where(File.id.in_(req.file_ids)))
        summaries = [f"{f.original_name}: {f.summary[:200]}" for f in fres.scalars() if f.summary]
        if summaries:
            extra += "參考資料：\n" + "\n".join(summaries)

    prompt = PROMPT_TMPL.format(topic=req.topic, num_slides=req.num_slides, extra=extra)

    raw = await generate_text(prompt)
    raw = raw.strip()
    # Strip markdown code fences if present
    raw = re.sub(r"^```[a-z]*\n?", "", raw)
    raw = re.sub(r"\n?```$", "", raw)
    raw = raw.strip()

    try:
        data = json.loads(raw)
    except Exception as e:
        logger.error(f"JSON parse error: {e}\nRaw: {raw[:500]}")
        raise HTTPException(500, f"AI 回應解析失敗，請重試")

    pres_id = str(uuid.uuid4())
    pres = {
        "id": pres_id,
        "project_id": project_id,
        "topic": req.topic,
        "template": req.template,
        "title": data.get("title", req.topic),
        "subtitle": data.get("subtitle", ""),
        "slides": data.get("slides", []),
        "created_at": datetime.utcnow().isoformat(),
    }
    _store[pres_id] = pres
    _store.setdefault(f"list_{project_id}", []).append(pres_id)
    return pres


@router.get("/{project_id}")
async def list_presentations(project_id: str):
    ids = _store.get(f"list_{project_id}", [])
    result = []
    for pid in ids:
        p = _store.get(pid)
        if p:
            result.append({
                "id": p["id"], "title": p["title"], "topic": p["topic"],
                "template": p["template"], "slide_count": len(p.get("slides", [])),
                "created_at": p["created_at"],
            })
    return sorted(result, key=lambda x: x["created_at"], reverse=True)


@router.get("/{project_id}/{pres_id}")
async def get_presentation(project_id: str, pres_id: str):
    p = _store.get(pres_id)
    if not p or p["project_id"] != project_id:
        raise HTTPException(404, "Not found")
    return p


@router.patch("/{project_id}/{pres_id}")
async def update_presentation(project_id: str, pres_id: str, data: dict):
    p = _store.get(pres_id)
    if not p or p["project_id"] != project_id:
        raise HTTPException(404, "Not found")
    if "slides" in data:
        p["slides"] = data["slides"]
    if "title" in data:
        p["title"] = data["title"]
    return p


@router.delete("/{project_id}/{pres_id}")
async def delete_presentation(project_id: str, pres_id: str):
    p = _store.pop(pres_id, None)
    if not p or p["project_id"] != project_id:
        raise HTTPException(404, "Not found")
    ids = _store.get(f"list_{project_id}", [])
    if pres_id in ids:
        ids.remove(pres_id)
    return {"ok": True}


@router.get("/{project_id}/{pres_id}/download")
async def download_pptx(project_id: str, pres_id: str):
    p = _store.get(pres_id)
    if not p or p["project_id"] != project_id:
        raise HTTPException(404, "Not found")
    try:
        buf = _build_pptx(p)
        safe_name = re.sub(r'[\\/:*?"<>|]', "-", p["title"])
        return StreamingResponse(
            io.BytesIO(buf),
            media_type="application/vnd.openxmlformats-officedocument.presentationml.presentation",
            headers={"Content-Disposition": f'attachment; filename="{safe_name}.pptx"'},
        )
    except ImportError:
        raise HTTPException(500, "python-pptx 未安裝，請執行 pip install python-pptx")
    except Exception as e:
        logger.error(f"PPTX build error: {e}", exc_info=True)
        raise HTTPException(500, str(e))


# ── PPTX Builder ──────────────────────────────────────

_TEMPLATES = {
    "professional": dict(bg=(26,26,46), header_bg=(15,15,26), title_fg=(255,255,255), content_fg=(226,232,240), accent=(99,102,241)),
    "modern":       dict(bg=(248,249,250), header_bg=(238,240,255), title_fg=(26,26,46), content_fg=(74,94,104), accent=(99,102,241)),
    "minimal":      dict(bg=(255,255,255), header_bg=(243,244,246), title_fg=(17,24,39), content_fg=(75,85,99), accent=(107,114,128)),
}


def _rgb(t): 
    from pptx.dml.color import RGBColor
    return RGBColor(*t)


def _build_pptx(p: dict) -> bytes:
    from pptx import Presentation as PRS
    from pptx.util import Inches, Pt
    from pptx.enum.text import PP_ALIGN

    tmpl = _TEMPLATES.get(p.get("template", "professional"), _TEMPLATES["professional"])

    prs = PRS()
    prs.slide_width = Inches(13.33)
    prs.slide_height = Inches(7.5)
    blank = prs.slide_layouts[6]

    for sd in p.get("slides", []):
        slide = prs.slides.add_slide(blank)

        # Background fill
        bg = slide.background.fill
        bg.solid()
        bg.fore_color.rgb = _rgb(tmpl["bg"])

        stype = sd.get("type", "content")
        stitle = sd.get("title", "")

        if stype == "title":
            _text_box(slide, stitle, Inches(1.5), Inches(2.2), Inches(10.3), Inches(1.5),
                      _rgb(tmpl["title_fg"]), Pt(44), bold=True, align=PP_ALIGN.CENTER)
            sub = sd.get("subtitle", "")
            if sub:
                _text_box(slide, sub, Inches(1.5), Inches(3.9), Inches(10.3), Inches(0.9),
                          _rgb(tmpl["content_fg"]), Pt(24), align=PP_ALIGN.CENTER)
            # Accent bar
            _rect(slide, Inches(5.16), Inches(3.75), Inches(3), Pt(4), _rgb(tmpl["accent"]))

        else:
            # Header bar
            _rect(slide, 0, 0, prs.slide_width, Inches(1.15), _rgb(tmpl["header_bg"]))
            _rect(slide, 0, Inches(1.15), prs.slide_width, Pt(3), _rgb(tmpl["accent"]))
            _text_box(slide, stitle, Inches(0.35), Inches(0.15), Inches(12.6), Inches(0.9),
                      _rgb(tmpl["title_fg"]), Pt(28), bold=True)

            if stype == "two_column":
                lc = sd.get("left_content", [])
                rc = sd.get("right_content", [])
                lt = sd.get("left_title", "")
                rt = sd.get("right_title", "")
                if lt:
                    _text_box(slide, lt, Inches(0.35), Inches(1.3), Inches(5.9), Inches(0.5),
                               _rgb(tmpl["accent"]), Pt(16), bold=True)
                if rt:
                    _text_box(slide, rt, Inches(7.05), Inches(1.3), Inches(5.9), Inches(0.5),
                               _rgb(tmpl["accent"]), Pt(16), bold=True)
                _bullets(slide, lc, Inches(0.35), Inches(1.85), Inches(5.9), Inches(5.2), _rgb(tmpl["content_fg"]))
                _bullets(slide, rc, Inches(7.05), Inches(1.85), Inches(5.9), Inches(5.2), _rgb(tmpl["content_fg"]))
                # Divider
                _rect(slide, Inches(6.66), Inches(1.2), Pt(1.5), Inches(6.3), _rgb(tmpl["accent"]))
            else:
                content = sd.get("content", [])
                _bullets(slide, content, Inches(0.5), Inches(1.35), Inches(12.33), Inches(5.7), _rgb(tmpl["content_fg"]))

    buf = io.BytesIO()
    prs.save(buf)
    return buf.getvalue()


def _text_box(slide, text, left, top, width, height, color, size, bold=False, align=None):
    from pptx.util import Pt
    from pptx.enum.text import PP_ALIGN
    txb = slide.shapes.add_textbox(left, top, width, height)
    tf = txb.text_frame
    tf.word_wrap = True
    p = tf.paragraphs[0]
    if align:
        p.alignment = align
    r = p.add_run()
    r.text = text
    r.font.size = size
    r.font.bold = bold
    r.font.color.rgb = color


def _bullets(slide, items, left, top, width, height, color):
    from pptx.util import Pt
    if not items:
        return
    txb = slide.shapes.add_textbox(left, top, width, height)
    tf = txb.text_frame
    tf.word_wrap = True
    for i, item in enumerate(items):
        para = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        para.space_before = Pt(6)
        r = para.add_run()
        r.text = f"▸  {item}"
        r.font.size = Pt(20)
        r.font.color.rgb = color


def _rect(slide, left, top, width, height, color):
    shape = slide.shapes.add_shape(1, left, top, width, height)
    shape.fill.solid()
    shape.fill.fore_color.rgb = color
    shape.line.fill.background()
