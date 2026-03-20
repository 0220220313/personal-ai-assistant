"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Wand2, Download, Plus, Trash2, Loader, ChevronLeft, ChevronRight,
  Edit2, X, Layers, Check, BarChart2, PieChart, GitBranch, Table2,
  Quote, AlignLeft, Columns, TrendingUp, Star, BookOpen,
} from "lucide-react";
import { slidesApi, filesApi, type Presentation, type PresentationSummary, type Slide, type FileItem } from "@/lib/api";
import ProjectLayout from "@/components/layout/ProjectLayout";

// ── Colour palette ────────────────────────────────────────────
const CHART_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#14b8a6"];

const TEMPLATES = [
  { key: "professional", label: "深色專業", colors: ["#0f0f1e","#6366f1","#ffffff"] },
  { key: "modern",       label: "明亮現代", colors: ["#f8f9ff","#6366f1","#1a1a2e"] },
  { key: "minimal",      label: "極簡白",   colors: ["#ffffff","#6366f1","#141828"] },
];

// ── Mini chart renderers (pure CSS / SVG) ─────────────────
function BarChart({ chart, dark }: { chart: any; dark: boolean }) {
  const vals: number[] = chart?.values || [];
  const labels: string[] = chart?.labels || [];
  const unit: string = chart?.unit || "";
  const max = Math.max(...vals, 1);
  return (
    <div className="flex items-end gap-1 h-20 px-2 pt-2">
      {vals.map((v, i) => (
        <div key={i} className="flex flex-col items-center flex-1 min-w-0">
          <span className="text-[8px] mb-0.5 truncate" style={{ color: dark?"#fff":"#1a1a2e" }}>
            {v}{unit}
          </span>
          <div className="w-full rounded-t"
            style={{ height: `${(v/max)*52}px`, backgroundColor: CHART_COLORS[i%CHART_COLORS.length] }} />
          <span className="text-[7px] mt-0.5 truncate w-full text-center text-gray-400">{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function PieChart({ chart, dark }: { chart: any; dark: boolean }) {
  const vals: number[] = chart?.values || [];
  const labels: string[] = chart?.labels || [];
  const total = vals.reduce((a, b) => a + b, 0) || 1;
  let angle = -90;
  const r = 38, cx = 50, cy = 50;
  const paths = vals.map((v, i) => {
    const deg = (v / total) * 360;
    const a1 = (angle * Math.PI) / 180;
    const a2 = ((angle + deg) * Math.PI) / 180;
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
    const large = deg > 180 ? 1 : 0;
    const d = `M${cx},${cy} L${x1},${y1} A${r},${r} 0 ${large},1 ${x2},${y2} Z`;
    angle += deg;
    return { d, color: CHART_COLORS[i % CHART_COLORS.length], label: labels[i], pct: Math.round(v/total*100) };
  });
  return (
    <div className="flex items-center gap-3 px-2">
      <svg width="100" height="100" viewBox="0 0 100 100">
        {paths.map((path, i) => <path key={i} d={path.d} fill={path.color} />)}
      </svg>
      <div className="space-y-1">
        {paths.map((path, i) => (
          <div key={i} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: path.color }} />
            <span className="text-[9px] text-gray-300 truncate max-w-[80px]">{path.label}</span>
            <span className="text-[9px] text-gray-500">{path.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChart({ chart, dark }: { chart: any; dark: boolean }) {
  const vals: number[] = chart?.values || [];
  const labels: string[] = chart?.labels || [];
  const max = Math.max(...vals, 1), min = Math.min(...vals, 0);
  const W = 200, H = 60, pad = 10;
  const xStep = vals.length > 1 ? (W - pad*2) / (vals.length - 1) : 0;
  const yScale = (H - pad*2) / (max - min || 1);
  const points = vals.map((v, i) => `${pad + i*xStep},${H - pad - (v-min)*yScale}`).join(" ");
  return (
    <div className="px-2">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <polyline points={points} fill="none" stroke="#6366f1" strokeWidth="2" />
        {vals.map((v, i) => (
          <circle key={i} cx={pad + i*xStep} cy={H - pad - (v-min)*yScale}
            r="3" fill="#6366f1" />
        ))}
      </svg>
      <div className="flex justify-between mt-0.5">
        {labels.map((l, i) => (
          <span key={i} className="text-[7px] text-gray-500 flex-1 text-center truncate">{l}</span>
        ))}
      </div>
    </div>
  );
}

function Flowchart({ flow, dark }: { flow: any; dark: boolean }) {
  const nodes: any[] = flow?.nodes || [];
  const conns: any[] = flow?.connections || [];
  const n = nodes.length || 1;
  const W = 320, H = 80, pad = 20;
  const nodeW = 60, nodeH = 30;
  const step = n > 1 ? (W - pad*2 - nodeW) / (n - 1) : 0;
  const pos: Record<string, {x:number,y:number}> = {};
  nodes.forEach((node, i) => { pos[node.id] = { x: pad + i*step + nodeW/2, y: H/2 }; });
  const fg = dark ? "#fff" : "#1a1a2e";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="px-2">
      {conns.map((c, i) => {
        const p1 = pos[c.from_||c.from]; const p2 = pos[c.to];
        if (!p1 || !p2) return null;
        return (
          <g key={i}>
            <line x1={p1.x+nodeW/2-5} y1={p1.y} x2={p2.x-nodeW/2+5} y2={p2.y}
              stroke={fg} strokeWidth="1" markerEnd="url(#arr)" opacity="0.6" />
            {c.label && <text x={(p1.x+p2.x)/2} y={p1.y-5} fill={fg} fontSize="7" textAnchor="middle">{c.label}</text>}
          </g>
        );
      })}
      <defs>
        <marker id="arr" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 Z" fill={fg} opacity="0.6" />
        </marker>
      </defs>
      {nodes.map((node) => {
        const p = pos[node.id]; if (!p) return null;
        const ntype = node.type || "process";
        return (
          <g key={node.id}>
            {ntype === "decision"
              ? <polygon points={`${p.x},${p.y-14} ${p.x+28},${p.y} ${p.x},${p.y+14} ${p.x-28},${p.y}`}
                  fill="#6366f1" />
              : <rect x={p.x-nodeW/2} y={p.y-nodeH/2} width={nodeW} height={nodeH}
                  rx={ntype==="start"||ntype==="end" ? 15 : 4} fill="#6366f1" />
            }
            <text x={p.x} y={p.y+1} fill="white" fontSize="7" textAnchor="middle"
              dominantBaseline="middle" fontWeight="bold">
              {node.label.length > 8 ? node.label.slice(0,7)+"…" : node.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Slide preview renderer ────────────────────────────────────
function SlideView({ slide, template, scale = 1 }: { slide: Slide; template: string; scale?: number }) {
  const tmpl = TEMPLATES.find(t => t.key === template) || TEMPLATES[0];
  const [bg, accent, fg] = tmpl.colors;
  const dark = template === "professional";
  const headerBg = template === "professional" ? "#0a0a14"
                 : template === "modern"       ? "#6366f1" : "#f8f8fc";
  const bodyFg = template === "professional" ? "#c8c8dc"
               : template === "modern"       ? "#282846" : "#3c3c50";

  const style: React.CSSProperties = {
    backgroundColor: bg, width: "100%", height: "100%",
    fontFamily: "'Segoe UI','PingFang TC',sans-serif",
    overflow: "hidden", position: "relative",
  };

  const stype = slide.type;

  if (stype === "title") return (
    <div style={style} className="flex flex-col items-center justify-center">
      <div style={{ width:"100%",height:"3px",backgroundColor:accent,position:"absolute",top:"42%" }} />
      <p style={{ color:fg,fontWeight:700,fontSize:"2em",textAlign:"center",padding:"0 8%",lineHeight:1.2 }}>
        {slide.title}
      </p>
      {slide.subtitle && (
        <p style={{ color:"#b0b0d0",fontSize:"1.1em",marginTop:"6%",textAlign:"center",padding:"0 12%" }}>
          {slide.subtitle}
        </p>
      )}
    </div>
  );

  if (stype === "chapter") return (
    <div style={style} className="flex items-center">
      <div style={{ width:"3%",height:"100%",backgroundColor:accent }} />
      <div style={{ padding:"0 6%",flex:1 }}>
        <p style={{ fontSize:"2.5em",marginBottom:"2%" }}>{(slide as any).icon || "◆"}</p>
        <p style={{ color:fg,fontWeight:700,fontSize:"1.8em",lineHeight:1.3 }}>{slide.title}</p>
        {slide.subtitle && <p style={{ color:accent,fontSize:"1em",marginTop:"4%" }}>{slide.subtitle}</p>}
      </div>
    </div>
  );

  if (stype === "quote") return (
    <div style={{ ...style, backgroundColor: headerBg }} className="flex flex-col items-center justify-center">
      <p style={{ color:accent,fontSize:"4em",alignSelf:"flex-start",padding:"0 6%" }}>"</p>
      <p style={{ color:fg,fontSize:"1.2em",fontStyle:"italic",textAlign:"center",padding:"0 10%",lineHeight:1.6 }}>
        {(slide as any).quote}
      </p>
      {(slide as any).author && (
        <p style={{ color:"#a0a0c0",fontSize:"0.9em",marginTop:"5%" }}>— {(slide as any).author}</p>
      )}
    </div>
  );

  const headerHeight = "18%";
  return (
    <div style={style}>
      {/* Header */}
      <div style={{ backgroundColor:headerBg, height:headerHeight, display:"flex",
        alignItems:"center", paddingLeft:"3%", borderLeft:`3px solid ${accent}` }}>
        <p style={{ color: template==="minimal"?(dark?"#fff":"#1a1a2e"):"#fff",
          fontWeight:700, fontSize:"1.2em" }}>{slide.title}</p>
      </div>
      {/* Body */}
      <div style={{ padding:"2% 3%", height:`${100-18}%`, overflow:"hidden" }}>
        {stype === "content" && (
          <div style={{ display:"flex",flexDirection:"column",gap:"3%",height:"100%" }}>
            {((slide as any).content || []).slice(0,6).map((item: any, i: number) => (
              <div key={i} style={{ display:"flex",alignItems:"center",gap:"3%" }}>
                <span style={{ fontSize:"1em" }}>{typeof item==="object"?item.icon:"▸"}</span>
                <span style={{ color:bodyFg,fontSize:"0.8em",lineHeight:1.4 }}>
                  {typeof item==="object"?item.text:item}
                </span>
              </div>
            ))}
          </div>
        )}
        {stype === "two_column" && (
          <div style={{ display:"grid",gridTemplateColumns:"1fr 2px 1fr",gap:"3%",height:"100%" }}>
            <div>
              {(slide as any).left_title && <p style={{color:accent,fontWeight:700,fontSize:"0.75em",marginBottom:"4%"}}>{(slide as any).left_title}</p>}
              {((slide as any).left_content||[]).slice(0,5).map((item: string,i: number) => (
                <p key={i} style={{color:bodyFg,fontSize:"0.7em",marginBottom:"3%"}}>▸ {item}</p>
              ))}
            </div>
            <div style={{backgroundColor:accent,opacity:0.4}} />
            <div>
              {(slide as any).right_title && <p style={{color:accent,fontWeight:700,fontSize:"0.75em",marginBottom:"4%"}}>{(slide as any).right_title}</p>}
              {((slide as any).right_content||[]).slice(0,5).map((item: string,i: number) => (
                <p key={i} style={{color:bodyFg,fontSize:"0.7em",marginBottom:"3%"}}>▸ {item}</p>
              ))}
            </div>
          </div>
        )}
        {(stype === "bar_chart") && <BarChart chart={(slide as any).chart} dark={dark} />}
        {(stype === "line_chart") && <LineChart chart={(slide as any).chart} dark={dark} />}
        {(stype === "pie_chart") && <PieChart chart={(slide as any).chart} dark={dark} />}
        {(stype === "flowchart") && <Flowchart flow={(slide as any).flow} dark={dark} />}
        {(stype === "table") && (
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.65em"}}>
            <thead>
              <tr>{((slide as any).table?.headers||[]).map((h:string,i:number)=>(
                <th key={i} style={{backgroundColor:accent,color:"#fff",padding:"2% 3%",textAlign:"left"}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {((slide as any).table?.rows||[]).slice(0,5).map((row:string[],i:number)=>(
                <tr key={i} style={{backgroundColor:i%2===1?`${bg}88`:undefined}}>
                  {row.map((cell,j)=><td key={j} style={{color:bodyFg,padding:"2% 3%"}}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {(stype === "summary") && (
          <div>
            {((slide as any).content||[]).slice(0,5).map((item:string,i:number)=>(
              <div key={i} style={{display:"flex",alignItems:"center",gap:"3%",marginBottom:"5%"}}>
                <span style={{color:accent,fontSize:"1em",fontWeight:700}}>✓</span>
                <span style={{color:accent,fontSize:"0.8em",fontWeight:700}}>{item}</span>
              </div>
            ))}
            {(slide as any).cta && (
              <div style={{backgroundColor:accent,padding:"3% 4%",borderRadius:"4px",marginTop:"4%",
                color:"#fff",fontWeight:700,fontSize:"0.8em",textAlign:"center"}}>
                → {(slide as any).cta}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Slide type icon ───────────────────────────────────────────
function SlideTypeIcon({ type }: { type: string }) {
  const map: Record<string, React.ReactNode> = {
    title:      <Star size={11} />,
    chapter:    <BookOpen size={11} />,
    content:    <AlignLeft size={11} />,
    two_column: <Columns size={11} />,
    bar_chart:  <BarChart2 size={11} />,
    line_chart: <TrendingUp size={11} />,
    pie_chart:  <PieChart size={11} />,
    flowchart:  <GitBranch size={11} />,
    table:      <Table2 size={11} />,
    quote:      <Quote size={11} />,
    summary:    <Check size={11} />,
  };
  return <span className="text-gray-500">{map[type] || <AlignLeft size={11}/>}</span>;
}

// ── Slide editor modal ────────────────────────────────────────────
function SlideEditor({ slide, onSave, onClose }: {
  slide: Slide;
  onSave: (s: Slide) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<any>({ ...slide });

  function updateContent(idx: number, field: "icon"|"text", val: string) {
    const c = [...(draft.content || [])];
    if (typeof c[idx] === "object") c[idx] = { ...c[idx], [field]: val };
    else c[idx] = val;
    setDraft((d: any) => ({ ...d, content: c }));
  }
  function addContentItem() {
    setDraft((d: any) => ({ ...d, content: [...(d.content||[]), { icon:"▸", text:"新增要點" }] }));
  }
  function removeContentItem(idx: number) {
    setDraft((d: any) => ({ ...d, content: d.content.filter((_: any, i: number) => i !== idx) }));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-white text-sm">編輯投影片</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white">
            <X size={16} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">標題</label>
            <input value={draft.title||""} onChange={e=>setDraft((d:any)=>({...d,title:e.target.value}))}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
          </div>
          {draft.type === "title" && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">副標題</label>
              <input value={draft.subtitle||""} onChange={e=>setDraft((d:any)=>({...d,subtitle:e.target.value}))}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          )}
          {draft.type === "content" && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-400">要點列表</label>
                <button onClick={addContentItem} className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                  <Plus size={11} /> 新增
                </button>
              </div>
              <div className="space-y-2">
                {(draft.content||[]).map((item: any, i: number) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input value={typeof item==="object"?item.icon:"▸"}
                      onChange={e=>updateContent(i,"icon",e.target.value)}
                      className="w-12 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none"
                      maxLength={2} />
                    <input value={typeof item==="object"?item.text:item}
                      onChange={e=>updateContent(i,"text",e.target.value)}
                      className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-indigo-500" />
                    <button onClick={()=>removeContentItem(i)} className="p-1.5 hover:text-red-400 text-gray-500">
                      <X size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          {draft.type === "quote" && (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">引述內容</label>
              <textarea value={draft.quote||""} onChange={e=>setDraft((d:any)=>({...d,quote:e.target.value}))} rows={3}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none" />
              <label className="text-xs text-gray-400 mb-1 block mt-3">來源</label>
              <input value={draft.author||""} onChange={e=>setDraft((d:any)=>({...d,author:e.target.value}))}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
            </div>
          )}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">演講備注</label>
            <textarea value={draft.notes||""} onChange={e=>setDraft((d:any)=>({...d,notes:e.target.value}))} rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none" />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-800 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm">取消</button>
          <button onClick={()=>onSave(draft)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium">儲存</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function SlidesPage() {
  const { id } = useParams<{ id: string }>();
  const [presentations, setPresentations] = useState<PresentationSummary[]>([]);
  const [current, setCurrent] = useState<Presentation | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [editingSlide, setEditingSlide] = useState<Slide | null>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [form, setForm] = useState({
    topic: "", num_slides: 10, template: "professional", extra_context: "",
  });

  useEffect(() => {
    slidesApi.list(id).then(setPresentations).catch(()=>{});
    filesApi.list(id).then(f => setFiles(f.filter(x=>x.is_indexed))).catch(()=>{});
  }, [id]);

  const slide = current?.slides[activeIdx];
  const tmpl = TEMPLATES.find(t => t.key === (current?.template || form.template)) || TEMPLATES[0];

  async function generate() {
    if (!form.topic.trim() || generating) return;
    setGenerating(true);
    try {
      const p = await slidesApi.generate(id, form);
      setCurrent(p);
      setActiveIdx(0);
      setPresentations(prev => [{ id:p.id,title:p.title,topic:p.topic,template:p.template,slide_count:p.slides.length,created_at:p.created_at }, ...prev]);
    } catch (e: any) {
      alert("生成失敗：" + e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function loadPresentation(presId: string) {
    try {
      const p = await slidesApi.get(id, presId);
      setCurrent(p); setActiveIdx(0);
    } catch {}
  }

  async function deletePres(presId: string) {
    await slidesApi.delete(id, presId);
    setPresentations(p => p.filter(x => x.id !== presId));
    if (current?.id === presId) { setCurrent(null); setActiveIdx(0); }
  }

  async function download() {
    if (!current || downloading) return;
    setDownloading(true);
    try { await slidesApi.download(id, current.id, current.title); }
    catch (e: any) { alert("下載失敗：" + e.message); }
    finally { setDownloading(false); }
  }

  function saveSlide(updated: Slide) {
    if (!current) return;
    const slides = current.slides.map((s, i) => i === activeIdx ? updated : s);
    const next = { ...current, slides };
    setCurrent(next);
    slidesApi.update(id, current.id, { slides }).catch(()=>{});
    setEditingSlide(null);
  }

  function addSlide() {
    if (!current) return;
    const newSlide: Slide = { id: Date.now().toString(), type: "content", title: "新投影片",
      content: [{ icon:"▸", text:"要點一" }] as any };
    const slides = [...current.slides, newSlide];
    const next = { ...current, slides };
    setCurrent(next);
    setActiveIdx(slides.length - 1);
    slidesApi.update(id, current.id, { slides }).catch(()=>{});
  }

  function removeSlide(idx: number) {
    if (!current || current.slides.length <= 1) return;
    const slides = current.slides.filter((_, i) => i !== idx);
    const next = { ...current, slides };
    setCurrent(next);
    setActiveIdx(Math.min(idx, slides.length - 1));
    slidesApi.update(id, current.id, { slides }).catch(()=>{});
  }

  return (
    <ProjectLayout projectId={id} activeTab="slides">
      <div className="flex h-full overflow-hidden">
        {/* ── Left panel ── */}
        <div className="w-64 shrink-0 border-r border-gray-800 bg-gray-900/40 flex flex-col">
          {/* Generate form */}
          <div className="p-4 border-b border-gray-800 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">AI 簡報生成</p>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">主題 *</label>
              <input value={form.topic} onChange={e=>setForm(f=>({...f,topic:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&generate()}
                placeholder="輸入簡報主題..."
                className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-sm focus:outline-none transition-colors" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">張數</label>
                <input type="number" min={5} max={25}
                  value={form.num_slides} onChange={e=>setForm(f=>({...f,num_slides:+e.target.value}))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-2 py-1.5 text-white text-sm focus:outline-none text-center" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">模板</label>
              <div className="grid grid-cols-3 gap-1.5">
                {TEMPLATES.map(t => (
                  <button key={t.key} onClick={()=>setForm(f=>({...f,template:t.key}))}
                    className={`p-2 rounded-lg border text-xs transition-colors ${form.template===t.key?"border-indigo-500 bg-indigo-900/20 text-indigo-300":"border-gray-700 text-gray-400 hover:border-gray-600"}`}>
                    <div className="flex gap-0.5 mb-1 justify-center">
                      {t.colors.map((c,i) => <div key={i} className="w-3 h-3 rounded-full" style={{backgroundColor:c}} />)}
                    </div>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">補充說明（選填）</label>
              <textarea value={form.extra_context} onChange={e=>setForm(f=>({...f,extra_context:e.target.value}))}
                placeholder="e.g. 醫院管理、季報、技術架構..." rows={2}
                className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-xs focus:outline-none resize-none transition-colors" />
            </div>
            <button onClick={generate} disabled={!form.topic.trim()||generating}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
              {generating ? <><Loader size={14} className="animate-spin" />生成中…</> : <><Wand2 size={14} />生成簡報</>}
            </button>
          </div>

          {/* History */}
          {presentations.length > 0 && (
            <div className="flex-1 overflow-y-auto p-3">
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-medium">歷史記錄</p>
              <div className="space-y-1.5">
                {presentations.map(p => (
                  <div key={p.id}
                    className={`flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-colors group border ${current?.id===p.id?"bg-indigo-900/20 border-indigo-700/40":"hover:bg-gray-800 border-transparent"}`}
                    onClick={()=>loadPresentation(p.id)}>
                    <Layers size={13} className="text-gray-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white truncate font-medium">{p.title}</p>
                      <p className="text-xs text-gray-600">{p.slide_count} 張</p>
                    </div>
                    <button onClick={e=>{e.stopPropagation();deletePres(p.id);}}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-gray-500 transition-all">
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Main area ── */}
        {current ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-3 bg-gray-900/20 shrink-0">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <div className="flex gap-1">
                  {TEMPLATES.find(t=>t.key===current.template)?.colors.map((c,i)=>
                    <div key={i} className="w-3 h-3 rounded-full" style={{backgroundColor:c}} />
                  )}
                </div>
                <h2 className="font-semibold text-white text-sm truncate">{current.title}</h2>
                <span className="text-xs text-gray-500 shrink-0">{current.slides.length} 張</span>
              </div>
              <button onClick={addSlide} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors">
                <Plus size={12} /> 新增
              </button>
              <button onClick={download} disabled={downloading}
                className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg font-medium transition-colors">
                {downloading ? <Loader size={12} className="animate-spin"/> : <Download size={12}/>}
                下載 PPTX
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Thumbnail strip */}
              <div className="w-40 shrink-0 border-r border-gray-800 overflow-y-auto bg-gray-900/20 p-2 space-y-2">
                {current.slides.map((s, i) => (
                  <div key={s.id} className={`relative group cursor-pointer rounded-lg overflow-hidden border-2 transition-all ${activeIdx===i?"border-indigo-500 shadow-lg shadow-indigo-900/30":"border-transparent hover:border-gray-600"}`}
                    onClick={()=>setActiveIdx(i)}>
                    <div style={{aspectRatio:"16/9",position:"relative"}}>
                      <div style={{position:"absolute",inset:0,transform:"scale(0.18)",transformOrigin:"top left",width:"556%",height:"556%",pointerEvents:"none"}}>
                        <SlideView slide={s} template={current.template} />
                      </div>
                    </div>
                    <div className="flex items-center justify-between px-1.5 py-1 bg-gray-900/80">
                      <div className="flex items-center gap-1">
                        <span className="text-gray-600 text-[10px]">{i+1}</span>
                        <SlideTypeIcon type={s.type} />
                      </div>
                      <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={e=>{e.stopPropagation();setEditingSlide(s);setActiveIdx(i);}}
                          className="p-0.5 bg-indigo-600/80 hover:bg-indigo-600 rounded text-white"><Edit2 size={9}/></button>
                        {current.slides.length > 1 && (
                          <button onClick={e=>{e.stopPropagation();removeSlide(i);}}
                            className="p-0.5 bg-red-600/80 hover:bg-red-600 rounded text-white"><X size={9}/></button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Main preview */}
              <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-950 overflow-auto">
                {slide && (
                  <>
                    <div className="w-full max-w-4xl shadow-2xl shadow-black/50 rounded-xl overflow-hidden cursor-pointer group"
                      style={{aspectRatio:"16/9"}} onClick={()=>setEditingSlide(slide)}>
                      <SlideView slide={slide} template={current.template} />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100">
                        <div className="bg-black/60 rounded-lg px-3 py-1.5 flex items-center gap-1.5 text-white text-sm">
                          <Edit2 size={13} /> 點擊編輯
                        </div>
                      </div>
                    </div>

                    {/* Navigation */}
                    <div className="flex items-center gap-4 mt-4">
                      <button onClick={()=>setActiveIdx(i=>Math.max(0,i-1))} disabled={activeIdx===0}
                        className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 transition-colors">
                        <ChevronLeft size={18}/>
                      </button>
                      <span className="text-sm text-gray-400">{activeIdx+1} / {current.slides.length}</span>
                      <button onClick={()=>setActiveIdx(i=>Math.min(current.slides.length-1,i+1))} disabled={activeIdx===current.slides.length-1}
                        className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 transition-colors">
                        <ChevronRight size={18}/>
                      </button>
                    </div>

                    {/* Notes */}
                    {slide.notes && (
                      <div className="mt-3 max-w-4xl w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">演講備注</p>
                        <p className="text-sm text-gray-400">{slide.notes}</p>
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-gray-800">
                <Wand2 size={32} className="text-indigo-400" />
              </div>
              <p className="text-white font-semibold mb-2">AI 簡報生成器</p>
              <p className="text-gray-500 text-sm mb-1">✔ 自動分章節與排版</p>
              <p className="text-gray-500 text-sm mb-1">✔ 自動生成圖表（長條/圓餅/折線）</p>
              <p className="text-gray-500 text-sm mb-1">✔ 自動流程圖</p>
              <p className="text-gray-500 text-sm mb-1">✔ 自動 Emoji 圖示</p>
              <p className="text-gray-500 text-sm mb-4">✔ 下載高品質 PPTX</p>
              <p className="text-gray-600 text-xs">在左側輸入主題，AI 即可自動生成完整簡報</p>
            </div>
          </div>
        )}
      </div>

      {editingSlide && current && (
        <SlideEditor slide={editingSlide} onSave={saveSlide} onClose={()=>setEditingSlide(null)} />
      )}
    </ProjectLayout>
  );
}
