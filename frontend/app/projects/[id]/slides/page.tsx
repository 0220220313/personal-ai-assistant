"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Wand2, Download, Trash2, Plus, ChevronLeft, ChevronRight,
  Edit2, Check, X, Loader, FileText, Layout, Layers,
} from "lucide-react";
import { slidesApi, filesApi, type Slide, type Presentation, type FileItem } from "@/lib/api";
import ProjectLayout from "@/components/layout/ProjectLayout";

const TEMPLATES = [
  { key: "professional", label: "專業深色", colors: ["#1a1a2e", "#6366f1", "#e2e8f0"] },
  { key: "modern",       label: "現代淺色", colors: ["#f8f9fa", "#6366f1", "#4a5e68"] },
  { key: "minimal",      label: "簡約白",   colors: ["#ffffff", "#6b7280", "#111827"] },
];

function SlidePreview({ slide, template, isActive, onClick }: {
  slide: Slide; template: string; isActive: boolean; onClick: () => void;
}) {
  const tmpl = TEMPLATES.find(t => t.key === template) || TEMPLATES[0];
  const [bg, accent, fg] = tmpl.colors;

  return (
    <button
      onClick={onClick}
      className={`relative w-full rounded-lg overflow-hidden border-2 transition-all ${isActive ? "border-indigo-500 shadow-lg shadow-indigo-900/30" : "border-transparent hover:border-gray-600"}`}
      style={{ aspectRatio: "16/9", backgroundColor: bg }}
    >
      {slide.type === "title" ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center p-3 text-center">
          <div className="w-8 h-0.5 mb-2" style={{ backgroundColor: accent }} />
          <p className="font-bold text-xs leading-tight" style={{ color: fg }}>{slide.title}</p>
          {slide.subtitle && <p className="text-xs opacity-70 mt-1" style={{ color: fg }}>{slide.subtitle}</p>}
        </div>
      ) : (
        <div className="absolute inset-0 flex flex-col">
          <div className="px-2 py-1.5" style={{ backgroundColor: template === "professional" ? "#0f0f1a" : template === "modern" ? "#eef0ff" : "#f3f4f6" }}>
            <p className="font-semibold text-xs truncate" style={{ color: template === "professional" ? "#fff" : "#1a1a2e" }}>{slide.title}</p>
          </div>
          <div className="flex-1 p-2 space-y-1">
            {(slide.content || []).slice(0, 3).map((item, i) => (
              <div key={i} className="flex items-start gap-1">
                <span className="text-xs mt-0.5" style={{ color: accent }}>▸</span>
                <p className="text-xs leading-tight opacity-80 truncate" style={{ color: fg }}>{item}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="absolute bottom-1 right-1.5 text-xs opacity-30" style={{ color: fg }}>
        {slide.id}
      </div>
    </button>
  );
}

function SlideEditor({ slide, template, onChange, onClose }: {
  slide: Slide; template: string; onChange: (s: Slide) => void; onClose: () => void;
}) {
  const [local, setLocal] = useState<Slide>({ ...slide, content: [...(slide.content || [])] });

  function save() { onChange(local); onClose(); }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-2xl shadow-2xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-white">編輯投影片</h3>
          <div className="flex gap-2">
            <button onClick={save} className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-4 py-1.5 rounded-lg text-sm transition-colors">
              <Check size={14} /> 儲存
            </button>
            <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"><X size={16} /></button>
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">標題</label>
            <input value={local.title} onChange={e => setLocal(s => ({ ...s, title: e.target.value }))}
              className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-sm focus:outline-none transition-colors" />
          </div>

          {local.type === "title" ? (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">副標題</label>
              <input value={local.subtitle || ""} onChange={e => setLocal(s => ({ ...s, subtitle: e.target.value }))}
                className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-sm focus:outline-none transition-colors" />
            </div>
          ) : local.type === "two_column" ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">左欄標題</label>
                <input value={local.left_title || ""} onChange={e => setLocal(s => ({ ...s, left_title: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-sm focus:outline-none" />
                <div className="mt-2 space-y-1">
                  {(local.left_content || []).map((item, i) => (
                    <div key={i} className="flex gap-1">
                      <input value={item} onChange={e => { const arr = [...(local.left_content || [])]; arr[i] = e.target.value; setLocal(s => ({ ...s, left_content: arr })); }}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500" />
                      <button onClick={() => { const arr = (local.left_content || []).filter((_, j) => j !== i); setLocal(s => ({ ...s, left_content: arr })); }}
                        className="p-1.5 text-gray-500 hover:text-red-400"><X size={12} /></button>
                    </div>
                  ))}
                  <button onClick={() => setLocal(s => ({ ...s, left_content: [...(s.left_content || []), ""] }))}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Plus size={11} /> 新增</button>
                </div>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">右欄標題</label>
                <input value={local.right_title || ""} onChange={e => setLocal(s => ({ ...s, right_title: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-sm focus:outline-none" />
                <div className="mt-2 space-y-1">
                  {(local.right_content || []).map((item, i) => (
                    <div key={i} className="flex gap-1">
                      <input value={item} onChange={e => { const arr = [...(local.right_content || [])]; arr[i] = e.target.value; setLocal(s => ({ ...s, right_content: arr })); }}
                        className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-indigo-500" />
                      <button onClick={() => { const arr = (local.right_content || []).filter((_, j) => j !== i); setLocal(s => ({ ...s, right_content: arr })); }}
                        className="p-1.5 text-gray-500 hover:text-red-400"><X size={12} /></button>
                    </div>
                  ))}
                  <button onClick={() => setLocal(s => ({ ...s, right_content: [...(s.right_content || []), ""] }))}
                    className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Plus size={11} /> 新增</button>
                </div>
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs text-gray-400 mb-1 block">要點（每點不超過 20 字）</label>
              <div className="space-y-1.5">
                {(local.content || []).map((item, i) => (
                  <div key={i} className="flex gap-1.5">
                    <input value={item} onChange={e => { const arr = [...(local.content || [])]; arr[i] = e.target.value; setLocal(s => ({ ...s, content: arr })); }}
                      className="flex-1 bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
                    <button onClick={() => { const arr = (local.content || []).filter((_, j) => j !== i); setLocal(s => ({ ...s, content: arr })); }}
                      className="p-2 text-gray-500 hover:text-red-400 hover:bg-gray-700 rounded-lg"><X size={14} /></button>
                  </div>
                ))}
                <button onClick={() => setLocal(s => ({ ...s, content: [...(s.content || []), ""] }))}
                  className="flex items-center gap-1 text-sm text-indigo-400 hover:text-indigo-300 px-1 py-0.5">
                  <Plus size={14} /> 新增要點
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 mb-1 block">演講備注（選填）</label>
            <textarea value={local.notes || ""} onChange={e => setLocal(s => ({ ...s, notes: e.target.value }))} rows={2}
              className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-sm focus:outline-none resize-none transition-colors" />
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SlidesPage() {
  const { id } = useParams<{ id: string }>();
  const [presentations, setPresentations] = useState<Presentation[]>([]);
  const [current, setCurrent] = useState<Presentation | null>(null);
  const [activeSlide, setActiveSlide] = useState(0);
  const [editingSlide, setEditingSlide] = useState<Slide | null>(null);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [form, setForm] = useState({ topic: "", num_slides: 8, template: "professional", extra_context: "" });
  const [view, setView] = useState<"generate" | "edit">("generate");

  useEffect(() => {
    slidesApi.list(id).then(setPresentations).catch(() => {});
    filesApi.list(id).then(f => setFiles(f.filter(x => x.is_indexed))).catch(() => {});
  }, [id]);

  async function generate() {
    if (!form.topic.trim() || generating) return;
    setGenerating(true);
    try {
      const pres = await slidesApi.generate(id, { ...form, file_ids: selectedFiles });
      setPresentations(prev => [{ id: pres.id, title: pres.title, topic: pres.topic, template: pres.template, slide_count: pres.slides.length, created_at: pres.created_at }, ...prev]);
      setCurrent(pres);
      setActiveSlide(0);
      setView("edit");
    } catch (e: any) {
      alert("生成失敗：" + (e.message || "請重試"));
    } finally {
      setGenerating(false);
    }
  }

  async function loadPresentation(presId: string) {
    const pres = await slidesApi.get(id, presId);
    setCurrent(pres); setActiveSlide(0); setView("edit");
  }

  async function saveSlide(updated: Slide) {
    if (!current) return;
    const newSlides = current.slides.map(s => s.id === updated.id ? updated : s);
    const updated_pres = { ...current, slides: newSlides };
    setCurrent(updated_pres);
    await slidesApi.update(id, current.id, { slides: newSlides });
  }

  async function addSlide() {
    if (!current) return;
    const newSlide: Slide = { id: String(current.slides.length + 1), type: "content", title: "新投影片", content: ["要點一", "要點二"], notes: "" };
    const newSlides = [...current.slides, newSlide];
    setCurrent(prev => prev ? { ...prev, slides: newSlides } : null);
    await slidesApi.update(id, current.id, { slides: newSlides });
    setActiveSlide(newSlides.length - 1);
  }

  async function removeSlide(idx: number) {
    if (!current || current.slides.length <= 1) return;
    const newSlides = current.slides.filter((_, i) => i !== idx);
    setCurrent(prev => prev ? { ...prev, slides: newSlides } : null);
    await slidesApi.update(id, current.id, { slides: newSlides });
    setActiveSlide(Math.min(idx, newSlides.length - 1));
  }

  async function download() {
    if (!current || downloading) return;
    setDownloading(true);
    try {
      await slidesApi.download(id, current.id, current.title);
    } finally {
      setDownloading(false);
    }
  }

  async function deletePres(presId: string) {
    await slidesApi.delete(id, presId);
    setPresentations(p => p.filter(x => x.id !== presId));
    if (current?.id === presId) { setCurrent(null); setView("generate"); }
  }

  const slide = current?.slides[activeSlide];

  return (
    <ProjectLayout projectId={id} activeTab="slides">
      <div className="flex h-full overflow-hidden">
        {/* Left panel */}
        <div className="w-72 shrink-0 border-r border-gray-800 bg-gray-900/40 flex flex-col overflow-hidden">
          {/* Generate form */}
          <div className="p-4 border-b border-gray-800 space-y-3">
            <h2 className="text-sm font-semibold text-white flex items-center gap-2"><Wand2 size={15} className="text-indigo-400" /> AI 生成簡報</h2>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">主題 *</label>
              <input value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && generate()}
                placeholder="例：季度業績報告、產品發表..." className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-sm focus:outline-none transition-colors" />
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">張數</label>
                <input type="number" min={3} max={20} value={form.num_slides} onChange={e => setForm(f => ({ ...f, num_slides: +e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-sm focus:outline-none" />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-400 mb-1 block">模板</label>
                <select value={form.template} onChange={e => setForm(f => ({ ...f, template: e.target.value }))}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-sm focus:outline-none">
                  {TEMPLATES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-400 mb-1 block">額外說明（選填）</label>
              <textarea value={form.extra_context} onChange={e => setForm(f => ({ ...f, extra_context: e.target.value }))} rows={2}
                placeholder="特殊要求、受眾、風格..." className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-sm focus:outline-none resize-none transition-colors" />
            </div>
            {files.length > 0 && (
              <div>
                <label className="text-xs text-gray-400 mb-1 block">引用知識庫文件（選填）</label>
                <div className="space-y-1 max-h-24 overflow-y-auto">
                  {files.map(f => (
                    <label key={f.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={selectedFiles.includes(f.id)} onChange={e => setSelectedFiles(prev => e.target.checked ? [...prev, f.id] : prev.filter(x => x !== f.id))}
                        className="rounded border-gray-600 bg-gray-800 text-indigo-500" />
                      <span className="text-xs text-gray-400 truncate">{f.original_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}
            <button onClick={generate} disabled={!form.topic.trim() || generating}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
              {generating ? <><Loader size={15} className="animate-spin" /> 生成中...</> : <><Wand2 size={15} /> 生成簡報</>}
            </button>
          </div>

          {/* History */}
          <div className="flex-1 overflow-y-auto">
            {presentations.length > 0 && (
              <div className="p-3">
                <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-medium">歷史記錄</p>
                <div className="space-y-1.5">
                  {presentations.map(p => (
                    <div key={p.id} className={`flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-colors group ${current?.id === p.id ? "bg-indigo-900/20 border border-indigo-700/40" : "hover:bg-gray-800 border border-transparent"}`}
                      onClick={() => loadPresentation(p.id)}>
                      <Layers size={14} className="text-gray-500 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-white truncate font-medium">{p.title}</p>
                        <p className="text-xs text-gray-600">{p.slide_count} 張</p>
                      </div>
                      <button onClick={e => { e.stopPropagation(); deletePres(p.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-gray-500 transition-all">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Main editor */}
        {current && view === "edit" ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-3 bg-gray-900/20">
              <h3 className="font-semibold text-white text-sm flex-1 truncate">{current.title}</h3>
              <span className="text-xs text-gray-500">{current.slides.length} 張投影片</span>
              <button onClick={addSlide} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors">
                <Plus size={13} /> 新增投影片
              </button>
              <button onClick={download} disabled={downloading}
                className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white px-4 py-1.5 rounded-lg transition-colors font-medium">
                {downloading ? <Loader size={13} className="animate-spin" /> : <Download size={13} />}
                下載 PPTX
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Slide thumbnails */}
              <div className="w-44 shrink-0 border-r border-gray-800 overflow-y-auto p-2 space-y-2 bg-gray-900/20">
                {current.slides.map((s, i) => (
                  <div key={s.id} className="relative group">
                    <SlidePreview slide={s} template={current.template} isActive={activeSlide === i} onClick={() => setActiveSlide(i)} />
                    <div className="absolute top-1 left-1 bg-black/50 text-white text-xs px-1 rounded">{i + 1}</div>
                    <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => setEditingSlide(s)} className="bg-indigo-600/80 hover:bg-indigo-600 p-0.5 rounded text-white"><Edit2 size={10} /></button>
                      {current.slides.length > 1 && (
                        <button onClick={() => removeSlide(i)} className="bg-red-600/80 hover:bg-red-600 p-0.5 rounded text-white"><X size={10} /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Main slide view */}
              <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-950 overflow-auto">
                {slide && (
                  <div className="w-full max-w-4xl" style={{ aspectRatio: "16/9" }}>
                    {(() => {
                      const tmpl = TEMPLATES.find(t => t.key === current.template) || TEMPLATES[0];
                      const [bg, accent, fg] = tmpl.colors;
                      return (
                        <div className="relative w-full h-full rounded-xl overflow-hidden shadow-2xl" style={{ backgroundColor: bg }}>
                          {slide.type === "title" ? (
                            <div className="absolute inset-0 flex flex-col items-center justify-center px-16 text-center">
                              <div className="w-24 h-1 rounded mb-6" style={{ backgroundColor: accent }} />
                              <h1 className="text-4xl font-bold mb-4 leading-tight" style={{ color: fg }}>{slide.title}</h1>
                              {slide.subtitle && <p className="text-xl opacity-80" style={{ color: fg }}>{slide.subtitle}</p>}
                            </div>
                          ) : (
                            <div className="absolute inset-0 flex flex-col">
                              <div className="px-8 py-5" style={{ backgroundColor: current.template === "professional" ? "#0f0f1a" : current.template === "modern" ? "#eef0ff" : "#f3f4f6" }}>
                                <div className="w-12 h-0.5 mb-2" style={{ backgroundColor: accent }} />
                                <h2 className="text-2xl font-bold" style={{ color: current.template === "professional" ? "#fff" : "#1a1a2e" }}>{slide.title}</h2>
                              </div>
                              <div className="flex-1 px-8 py-6">
                                {slide.type === "two_column" ? (
                                  <div className="grid grid-cols-2 gap-8 h-full">
                                    <div>
                                      {slide.left_title && <h3 className="font-semibold text-sm mb-3 uppercase tracking-wider" style={{ color: accent }}>{slide.left_title}</h3>}
                                      <ul className="space-y-3">
                                        {(slide.left_content || []).map((item, i) => (
                                          <li key={i} className="flex items-start gap-2 text-lg" style={{ color: fg }}>
                                            <span className="mt-1 text-sm" style={{ color: accent }}>▸</span>{item}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                    <div className="border-l pl-8" style={{ borderColor: accent + "40" }}>
                                      {slide.right_title && <h3 className="font-semibold text-sm mb-3 uppercase tracking-wider" style={{ color: accent }}>{slide.right_title}</h3>}
                                      <ul className="space-y-3">
                                        {(slide.right_content || []).map((item, i) => (
                                          <li key={i} className="flex items-start gap-2 text-lg" style={{ color: fg }}>
                                            <span className="mt-1 text-sm" style={{ color: accent }}>▸</span>{item}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>
                                ) : (
                                  <ul className="space-y-4">
                                    {(slide.content || []).map((item, i) => (
                                      <li key={i} className="flex items-start gap-3 text-xl" style={{ color: fg }}>
                                        <span className="mt-1" style={{ color: accent }}>▸</span>{item}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {/* Navigation */}
                <div className="flex items-center gap-4 mt-4">
                  <button onClick={() => setActiveSlide(i => Math.max(0, i - 1))} disabled={activeSlide === 0}
                    className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 transition-colors"><ChevronLeft size={18} /></button>
                  <span className="text-sm text-gray-400">{activeSlide + 1} / {current.slides.length}</span>
                  <button onClick={() => setActiveSlide(i => Math.min(current.slides.length - 1, i + 1))} disabled={activeSlide === current.slides.length - 1}
                    className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white disabled:opacity-30 transition-colors"><ChevronRight size={18} /></button>
                </div>

                {slide?.notes && (
                  <div className="mt-3 max-w-4xl w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                    <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider">備注</p>
                    <p className="text-sm text-gray-400">{slide.notes}</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Layers size={28} className="text-gray-600" />
              </div>
              <p className="text-gray-400 font-medium">在左側輸入主題，AI 即可生成簡報</p>
              <p className="text-gray-600 text-sm mt-1">支援編輯、預覽、下載 PPTX</p>
            </div>
          </div>
        )}
      </div>

      {editingSlide && (
        <SlideEditor slide={editingSlide} template={current?.template || "professional"}
          onChange={saveSlide} onClose={() => setEditingSlide(null)} />
      )}
    </ProjectLayout>
  );
}
