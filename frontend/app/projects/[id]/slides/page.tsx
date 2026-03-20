"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import {
  Wand2, Download, Plus, Trash2, Loader, ChevronLeft, ChevronRight,
  Edit2, X, Layers, Check, BarChart2, PieChart as PieChartIcon, GitBranch,
  Table2, Quote, AlignLeft, Columns, TrendingUp, Star, BookOpen, FileText,
} from "lucide-react";
import { slidesApi, filesApi, type Presentation, type PresentationSummary, type Slide, type FileItem } from "@/lib/api";
import ProjectLayout from "@/components/layout/ProjectLayout";

const CHART_COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444","#14b8a6"];

const TEMPLATES = [
  { key: "professional", label: "深色專業", colors: ["#0f0f1e","#6366f1","#ffffff"] },
  { key: "modern",       label: "明亮現代", colors: ["#f8f9ff","#6366f1","#1a1a2e"] },
  { key: "minimal",      label: "極簡白",   colors: ["#ffffff","#6366f1","#141828"] },
];

// ── Chart Renderers ──────────────────────────────────────

function BarChartPreview({ chart, dark }: { chart: any; dark: boolean }) {
  const vals: number[] = chart?.values || [];
  const labels: string[] = chart?.labels || [];
  const unit: string = chart?.unit || "";
  const max = Math.max(...vals, 1);
  const fg = dark ? "#e0e0f0" : "#1a1a2e";
  return (
    <div className="flex flex-col h-full px-4 pt-2 pb-1">
      <div className="flex items-end gap-1.5 flex-1">
        {vals.map((v, i) => (
          <div key={i} className="flex flex-col items-center flex-1 min-w-0">
            <span style={{ color: fg, fontSize:"0.55em", marginBottom:"2px" }}>{v}{unit}</span>
            <div style={{ width:"100%", borderRadius:"3px 3px 0 0", height:`${Math.max(8,(v/max)*100)}%`,
              backgroundColor: CHART_COLORS[i%CHART_COLORS.length], minHeight:"6px" }} />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1">
        {labels.map((l,i) => (
          <span key={i} className="flex-1 text-center truncate" style={{ color:"#888", fontSize:"0.5em" }}>{l}</span>
        ))}
      </div>
    </div>
  );
}

function PieChartPreview({ chart, dark }: { chart: any; dark: boolean }) {
  const vals: number[] = chart?.values || [];
  const labels: string[] = chart?.labels || [];
  const total = vals.reduce((a,b)=>a+b,0)||1;
  let angle = -90;
  const r=42, cx=50, cy=50;
  const paths = vals.map((v,i) => {
    const deg = (v/total)*360;
    const a1=(angle*Math.PI)/180, a2=((angle+deg)*Math.PI)/180;
    const x1=cx+r*Math.cos(a1), y1=cy+r*Math.sin(a1);
    const x2=cx+r*Math.cos(a2), y2=cy+r*Math.sin(a2);
    const large=deg>180?1:0;
    const d=`M${cx},${cy} L${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large},1 ${x2.toFixed(1)},${y2.toFixed(1)} Z`;
    angle+=deg;
    return { d, color:CHART_COLORS[i%CHART_COLORS.length], label:labels[i], pct:Math.round(v/total*100) };
  });
  return (
    <div className="flex items-center gap-4 h-full px-4">
      <svg width="100" height="100" viewBox="0 0 100 100" className="shrink-0">
        {paths.map((p,i) => <path key={i} d={p.d} fill={p.color} />)}
        <circle cx={cx} cy={cy} r={18} fill={dark?"#0f0f1e":"#ffffff"} />
      </svg>
      <div className="space-y-1.5 min-w-0">
        {paths.map((p,i) => (
          <div key={i} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm shrink-0" style={{backgroundColor:p.color}} />
            <span className="text-[0.6em] truncate" style={{color:dark?"#ccc":"#333"}}>{p.label}</span>
            <span className="text-[0.6em] font-bold" style={{color:p.color}}>{p.pct}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function LineChartPreview({ chart, dark }: { chart: any; dark: boolean }) {
  const vals: number[] = chart?.values || [];
  const labels: string[] = chart?.labels || [];
  const W=280, H=80, pad=15;
  const max=Math.max(...vals,1), min=Math.min(...vals,0);
  const xStep = vals.length>1 ? (W-pad*2)/(vals.length-1) : 0;
  const yScale = (H-pad*2)/(max-min||1);
  const pts = vals.map((v,i)=>`${pad+i*xStep},${H-pad-(v-min)*yScale}`).join(" ");
  const fg = dark?"#e0e0f0":"#1a1a2e";
  return (
    <div className="px-3 h-full flex flex-col justify-center">
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#6366f1" stopOpacity="0.3"/>
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0"/>
          </linearGradient>
        </defs>
        <polygon points={`${pad},${H-pad} ${pts} ${pad+(vals.length-1)*xStep},${H-pad}`}
          fill="url(#lineGrad)" />
        <polyline points={pts} fill="none" stroke="#6366f1" strokeWidth="2.5" strokeLinejoin="round"/>
        {vals.map((v,i)=>(
          <circle key={i} cx={pad+i*xStep} cy={H-pad-(v-min)*yScale}
            r="4" fill="#6366f1" stroke={dark?"#0f0f1e":"#fff"} strokeWidth="2"/>
        ))}
      </svg>
      <div className="flex justify-between">
        {labels.map((l,i)=>(
          <span key={i} style={{color:"#888",fontSize:"0.5em"}} className="text-center">{l}</span>
        ))}
      </div>
    </div>
  );
}

function FlowchartPreview({ flow, dark }: { flow: any; dark: boolean }) {
  const nodes: any[] = flow?.nodes||[];
  const conns: any[] = flow?.connections||[];
  if (!nodes.length) return null;
  const W=320, H=100, pad=16, nodeW=52, nodeH=28;
  const step = nodes.length>1 ? (W-pad*2-nodeW)/(nodes.length-1) : 0;
  const pos: Record<string,{x:number,y:number}> = {};
  nodes.forEach((n,i)=>{ pos[n.id]={x:pad+i*step+nodeW/2, y:H/2}; });
  const fg = dark?"rgba(255,255,255,0.7)":"rgba(0,0,0,0.6)";
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
      <defs>
        <marker id="arr" markerWidth="8" markerHeight="8" refX="4" refY="4" orient="auto">
          <path d="M0,0 L0,8 L8,4 Z" fill={fg}/>
        </marker>
      </defs>
      {conns.map((c,i)=>{
        const p1=pos[c.from_||c.from]; const p2=pos[c.to];
        if(!p1||!p2) return null;
        return <g key={i}>
          <line x1={p1.x+nodeW/2-4} y1={p1.y} x2={p2.x-nodeW/2+4} y2={p2.y}
            stroke={fg} strokeWidth="1.5" markerEnd="url(#arr)"/>
          {c.label&&<text x={(p1.x+p2.x)/2} y={p1.y-6} fill={fg} fontSize="7" textAnchor="middle">{c.label}</text>}
        </g>;
      })}
      {nodes.map(node=>{
        const p=pos[node.id]; if(!p) return null;
        const ntype=node.type||"process";
        return <g key={node.id}>
          {ntype==="decision"
            ? <polygon points={`${p.x},${p.y-14} ${p.x+26},${p.y} ${p.x},${p.y+14} ${p.x-26},${p.y}`}
                fill="#6366f1"/>
            : <rect x={p.x-nodeW/2} y={p.y-nodeH/2} width={nodeW} height={nodeH}
                rx={ntype==="start"||ntype==="end"?14:5} fill="#6366f1"/>
          }
          <text x={p.x} y={p.y+0.5} fill="white" fontSize="8" textAnchor="middle"
            dominantBaseline="middle" fontWeight="bold">
            {node.label.length>8?node.label.slice(0,7)+"…":node.label}
          </text>
        </g>;
      })}
    </svg>
  );
}

// ── Slide Renderer ────────────────────────────────────────

function SlideView({ slide, template }: { slide: any; template: string }) {
  const tmpl = TEMPLATES.find(t=>t.key===template)||TEMPLATES[0];
  const [bg, accent, fg] = tmpl.colors;
  const dark = template==="professional";
  const headerBg = template==="professional"?"#0a0a18":template==="modern"?"#6366f1":"#f0f0f8";
  const bodyFg   = template==="professional"?"#c8c8e0":template==="modern"?"#282850":"#3c3c54";
  const titleFg  = template==="minimal"?"#141828":"#ffffff";

  const base: React.CSSProperties = {
    backgroundColor:bg, width:"100%", height:"100%",
    fontFamily:"'Segoe UI','PingFang TC','Microsoft JhengHei',sans-serif",
    overflow:"hidden", position:"relative", userSelect:"none",
  };

  const stype = slide.type;

  // TITLE SLIDE
  if (stype==="title") return (
    <div style={base} className="flex flex-col items-center justify-center">
      <div style={{position:"absolute",top:"0",left:"0",right:"0",height:"4px",
        background:`linear-gradient(90deg,${accent},${accent}88)`}} />
      <div style={{position:"absolute",bottom:"0",left:"0",right:"0",height:"4px",
        background:`linear-gradient(90deg,${accent}44,${accent})`}} />
      <div style={{textAlign:"center",padding:"0 10%"}}>
        <div style={{width:"60px",height:"3px",backgroundColor:accent,margin:"0 auto 6% auto",borderRadius:"2px"}}/>
        <h1 style={{color:dark?"#ffffff":fg,fontWeight:800,fontSize:"2.4em",lineHeight:1.2,marginBottom:"5%",
          textShadow:dark?"0 2px 20px rgba(99,102,241,0.4)":"none"}}>{slide.title}</h1>
        {slide.subtitle&&<p style={{color:dark?"#a0a0c8":bodyFg,fontSize:"1.1em",lineHeight:1.5}}>{slide.subtitle}</p>}
        <div style={{width:"40px",height:"3px",backgroundColor:accent+"88",margin:"6% auto 0 auto",borderRadius:"2px"}}/>
      </div>
    </div>
  );

  // CHAPTER SLIDE
  if (stype==="chapter") return (
    <div style={base} className="flex items-stretch">
      <div style={{width:"8px",background:`linear-gradient(180deg,${accent},${accent}66)`}} />
      <div style={{flex:1,display:"flex",flexDirection:"column",justifyContent:"center",padding:"0 7%",
        background:dark?`linear-gradient(135deg,${bg} 60%,${accent}15)`:`linear-gradient(135deg,${bg} 60%,${accent}0d)`}}>
        <p style={{fontSize:"2.8em",marginBottom:"3%"}}>{slide.icon||"◆"}</p>
        <h2 style={{color:dark?"#ffffff":fg,fontWeight:800,fontSize:"1.9em",lineHeight:1.3,marginBottom:"3%"}}>{slide.title}</h2>
        {slide.subtitle&&<p style={{color:accent,fontSize:"1em",fontWeight:500}}>{slide.subtitle}</p>}
      </div>
      <div style={{width:"4px",backgroundColor:accent+"30"}} />
    </div>
  );

  // QUOTE SLIDE
  if (stype==="quote") return (
    <div style={{...base,backgroundColor:headerBg}} className="flex flex-col items-center justify-center">
      <div style={{position:"absolute",top:"8%",left:"5%",fontSize:"4em",color:accent,opacity:0.8,lineHeight:1}}>"</div>
      <div style={{padding:"0 10%",textAlign:"center"}}>
        <p style={{color:dark?"#ffffff":fg,fontSize:"1.25em",fontStyle:"italic",lineHeight:1.7,
          textShadow:dark?"0 1px 10px rgba(0,0,0,0.5)":"none"}}>{slide.quote}</p>
        {slide.author&&(
          <div style={{marginTop:"6%"}}>
            <div style={{width:"40px",height:"2px",backgroundColor:accent,margin:"0 auto 3% auto"}}/>
            <p style={{color:accent,fontSize:"0.85em",fontWeight:600}}>— {slide.author}</p>
          </div>
        )}
      </div>
    </div>
  );

  // SUMMARY SLIDE
  if (stype==="summary") return (
    <div style={base}>
      <div style={{backgroundColor:headerBg,height:"18%",display:"flex",alignItems:"center",
        padding:"0 4%",borderLeft:`5px solid ${accent}`}}>
        <h2 style={{color:titleFg,fontWeight:800,fontSize:"1.3em"}}>{slide.title||"總結"}</h2>
      </div>
      <div style={{padding:"3% 4%",height:"67%",overflow:"hidden"}}>
        {(slide.content||[]).slice(0,5).map((item: string,i: number)=>(
          <div key={i} style={{display:"flex",alignItems:"center",gap:"3%",marginBottom:"3%"}}>
            <div style={{width:"20px",height:"20px",borderRadius:"50%",backgroundColor:accent,
              display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
              <span style={{color:"white",fontSize:"0.65em",fontWeight:700}}>✓</span>
            </div>
            <span style={{color:bodyFg,fontSize:"0.9em",fontWeight:600}}>{item}</span>
          </div>
        ))}
      </div>
      {slide.cta&&(
        <div style={{position:"absolute",bottom:"4%",left:"4%",right:"4%",
          backgroundColor:accent,borderRadius:"8px",padding:"2.5% 4%",
          display:"flex",alignItems:"center",justifyContent:"center"}}>
          <span style={{color:"white",fontWeight:700,fontSize:"0.9em"}}>→ {slide.cta}</span>
        </div>
      )}
    </div>
  );

  // CHART SLIDES
  if (stype==="bar_chart"||stype==="line_chart"||stype==="pie_chart") return (
    <div style={base}>
      <div style={{backgroundColor:headerBg,height:"17%",display:"flex",alignItems:"center",
        padding:"0 4%",borderLeft:`5px solid ${accent}`}}>
        <h2 style={{color:titleFg,fontWeight:700,fontSize:"1.15em"}}>{slide.title}</h2>
      </div>
      <div style={{height:"78%",padding:"1% 2%"}}>
        {stype==="bar_chart"  && <BarChartPreview  chart={slide.chart} dark={dark}/>}
        {stype==="pie_chart"  && <PieChartPreview  chart={slide.chart} dark={dark}/>}
        {stype==="line_chart" && <LineChartPreview chart={slide.chart} dark={dark}/>}
      </div>
    </div>
  );

  // FLOWCHART
  if (stype==="flowchart") return (
    <div style={base}>
      <div style={{backgroundColor:headerBg,height:"17%",display:"flex",alignItems:"center",
        padding:"0 4%",borderLeft:`5px solid ${accent}`}}>
        <h2 style={{color:titleFg,fontWeight:700,fontSize:"1.15em"}}>{slide.title}</h2>
      </div>
      <div style={{height:"78%",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <FlowchartPreview flow={slide.flow} dark={dark}/>
      </div>
    </div>
  );

  // TABLE
  if (stype==="table") return (
    <div style={base}>
      <div style={{backgroundColor:headerBg,height:"17%",display:"flex",alignItems:"center",
        padding:"0 4%",borderLeft:`5px solid ${accent}`}}>
        <h2 style={{color:titleFg,fontWeight:700,fontSize:"1.15em"}}>{slide.title}</h2>
      </div>
      <div style={{padding:"2% 4%",height:"78%",overflow:"hidden"}}>
        <table style={{width:"100%",borderCollapse:"collapse",fontSize:"0.7em"}}>
          <thead>
            <tr>{(slide.table?.headers||[]).map((h:string,i:number)=>(
              <th key={i} style={{backgroundColor:accent,color:"white",padding:"2% 3%",textAlign:"left",
                fontWeight:700,fontSize:"0.9em"}}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {(slide.table?.rows||[]).slice(0,6).map((row:string[],i:number)=>(
              <tr key={i} style={{backgroundColor:i%2===0?"transparent":(dark?"rgba(255,255,255,0.04)":"rgba(0,0,0,0.03)")}}>
                {row.map((cell,j)=><td key={j} style={{color:bodyFg,padding:"1.8% 3%",borderBottom:`1px solid ${dark?"rgba(255,255,255,0.08)":"rgba(0,0,0,0.06)"}`}}>{cell}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  // TWO COLUMN
  if (stype==="two_column") return (
    <div style={base}>
      <div style={{backgroundColor:headerBg,height:"17%",display:"flex",alignItems:"center",
        padding:"0 4%",borderLeft:`5px solid ${accent}`}}>
        <h2 style={{color:titleFg,fontWeight:700,fontSize:"1.15em"}}>{slide.title}</h2>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1px 1fr",height:"78%",padding:"2% 3%",gap:"3%"}}>
        <div>
          {slide.left_title&&<p style={{color:accent,fontWeight:700,fontSize:"0.8em",marginBottom:"5%",textTransform:"uppercase",letterSpacing:"0.05em"}}>{slide.left_title}</p>}
          {(slide.left_content||[]).slice(0,5).map((item:string,i:number)=>(
            <div key={i} style={{display:"flex",gap:"3%",marginBottom:"4%",alignItems:"flex-start"}}>
              <span style={{color:accent,flexShrink:0,marginTop:"1px"}}>▸</span>
              <span style={{color:bodyFg,fontSize:"0.75em",lineHeight:1.5}}>{item}</span>
            </div>
          ))}
        </div>
        <div style={{backgroundColor:accent+"30"}}/>
        <div>
          {slide.right_title&&<p style={{color:accent,fontWeight:700,fontSize:"0.8em",marginBottom:"5%",textTransform:"uppercase",letterSpacing:"0.05em"}}>{slide.right_title}</p>}
          {(slide.right_content||[]).slice(0,5).map((item:string,i:number)=>(
            <div key={i} style={{display:"flex",gap:"3%",marginBottom:"4%",alignItems:"flex-start"}}>
              <span style={{color:accent,flexShrink:0,marginTop:"1px"}}>▸</span>
              <span style={{color:bodyFg,fontSize:"0.75em",lineHeight:1.5}}>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  // CONTENT (default)
  return (
    <div style={base}>
      <div style={{backgroundColor:headerBg,height:"17%",display:"flex",alignItems:"center",
        padding:"0 4%",borderLeft:`5px solid ${accent}`}}>
        <h2 style={{color:titleFg,fontWeight:700,fontSize:"1.15em"}}>{slide.title}</h2>
      </div>
      <div style={{padding:"2% 4%",height:"78%",overflow:"hidden"}}>
        {(slide.content||[]).slice(0,6).map((item:any,i:number)=>{
          const icon = typeof item==="object"?item.icon:"▸";
          const text = typeof item==="object"?item.text:item;
          return (
            <div key={i} style={{display:"flex",alignItems:"flex-start",gap:"3%",marginBottom:"3.5%"}}>
              <span style={{fontSize:"1em",flexShrink:0,lineHeight:1.4}}>{icon}</span>
              <span style={{color:bodyFg,fontSize:"0.78em",lineHeight:1.5}}>{text}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Slide Type Icon ───────────────────────────────────────
function SlideTypeIcon({ type }: { type: string }) {
  const map: Record<string,React.ReactNode> = {
    title:<Star size={10}/>, chapter:<BookOpen size={10}/>, content:<AlignLeft size={10}/>,
    two_column:<Columns size={10}/>, bar_chart:<BarChart2 size={10}/>, line_chart:<TrendingUp size={10}/>,
    pie_chart:<PieChartIcon size={10}/>, flowchart:<GitBranch size={10}/>,
    table:<Table2 size={10}/>, quote:<Quote size={10}/>, summary:<Check size={10}/>,
  };
  return <span className="text-gray-500">{map[type]||<AlignLeft size={10}/>}</span>;
}

// ── Slide Editor Modal ────────────────────────────────────
function SlideEditor({ slide, onSave, onClose }: { slide: any; onSave:(s:any)=>void; onClose:()=>void }) {
  const [draft, setDraft] = useState<any>({...slide});

  function updateContent(idx:number, field:"icon"|"text", val:string) {
    const c=[...(draft.content||[])];
    c[idx]=typeof c[idx]==="object"?{...c[idx],[field]:val}:val;
    setDraft((d:any)=>({...d,content:c}));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-xl max-h-[80vh] flex flex-col"
        onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <h3 className="font-semibold text-white text-sm">編輯投影片</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white"><X size={16}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          <div>
            <label className="text-xs text-gray-400 mb-1 block">標題</label>
            <input value={draft.title||""} onChange={e=>setDraft((d:any)=>({...d,title:e.target.value}))}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"/>
          </div>
          {(draft.type==="title"||draft.type==="chapter")&&(
            <div>
              <label className="text-xs text-gray-400 mb-1 block">副標題</label>
              <input value={draft.subtitle||""} onChange={e=>setDraft((d:any)=>({...d,subtitle:e.target.value}))}
                className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"/>
            </div>
          )}
          {draft.type==="content"&&(
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-400">要點列表</label>
                <button onClick={()=>setDraft((d:any)=>({...d,content:[...(d.content||[]),{icon:"▸",text:"新增要點"}]}))}
                  className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"><Plus size={11}/>新增</button>
              </div>
              {(draft.content||[]).map((item:any,i:number)=>(
                <div key={i} className="flex gap-2 items-center mb-2">
                  <input value={typeof item==="object"?item.icon:"▸"} onChange={e=>updateContent(i,"icon",e.target.value)}
                    className="w-12 bg-gray-800 border border-gray-700 rounded-lg px-2 py-1.5 text-white text-sm text-center focus:outline-none" maxLength={2}/>
                  <input value={typeof item==="object"?item.text:item} onChange={e=>updateContent(i,"text",e.target.value)}
                    className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-indigo-500"/>
                  <button onClick={()=>setDraft((d:any)=>({...d,content:d.content.filter((_:any,j:number)=>j!==i)}))}
                    className="p-1.5 hover:text-red-400 text-gray-500"><X size={13}/></button>
                </div>
              ))}
            </div>
          )}
          {draft.type==="quote"&&(
            <>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">引述內容</label>
                <textarea value={draft.quote||""} onChange={e=>setDraft((d:any)=>({...d,quote:e.target.value}))} rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"/>
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">來源</label>
                <input value={draft.author||""} onChange={e=>setDraft((d:any)=>({...d,author:e.target.value}))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"/>
              </div>
            </>
          )}
          <div>
            <label className="text-xs text-gray-400 mb-1 block">演講備注</label>
            <textarea value={draft.notes||""} onChange={e=>setDraft((d:any)=>({...d,notes:e.target.value}))} rows={2}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 resize-none"/>
          </div>
        </div>
        <div className="px-5 py-3 border-t border-gray-800 flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl text-sm">取消</button>
          <button onClick={()=>onSave(draft)} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-medium">儲存</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────
export default function SlidesPage() {
  const { id } = useParams<{ id: string }>();
  const [presentations, setPresentations] = useState<PresentationSummary[]>([]);
  const [current, setCurrent] = useState<Presentation | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [editingSlide, setEditingSlide] = useState<any>(null);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [form, setForm] = useState({ topic:"", num_slides:10, template:"professional", extra_context:"" });

  useEffect(() => {
    slidesApi.list(id).then(setPresentations).catch(()=>{});
    filesApi.list(id).then(f=>setFiles(f.filter(x=>x.is_indexed))).catch(()=>{});
  }, [id]);

  const slide = current?.slides[activeIdx];
  const template = current?.template || form.template;

  async function generate() {
    if (!form.topic.trim()||generating) return;
    setGenerating(true);
    try {
      const p = await slidesApi.generate(id, { ...form, file_ids: selectedFiles });
      setCurrent(p); setActiveIdx(0);
      setPresentations(prev=>[{id:p.id,title:p.title,topic:p.topic,template:p.template,
        slide_count:p.slides.length,created_at:p.created_at},...prev]);
    } catch(e:any) { alert("生成失敗："+e.message); }
    finally { setGenerating(false); }
  }

  async function loadPres(presId:string) {
    try { const p=await slidesApi.get(id,presId); setCurrent(p); setActiveIdx(0); } catch {}
  }

  async function deletePres(presId:string) {
    await slidesApi.delete(id,presId);
    setPresentations(p=>p.filter(x=>x.id!==presId));
    if(current?.id===presId){setCurrent(null);setActiveIdx(0);}
  }

  async function download() {
    if(!current||downloading) return;
    setDownloading(true);
    try { await slidesApi.download(id,current.id,current.title); }
    catch(e:any){alert("下載失敗："+e.message);}
    finally{setDownloading(false);}
  }

  function saveSlide(updated:any) {
    if(!current) return;
    const slides=current.slides.map((s,i)=>i===activeIdx?updated:s);
    const next={...current,slides};
    setCurrent(next);
    slidesApi.update(id,current.id,{slides}).catch(()=>{});
    setEditingSlide(null);
  }

  function addSlide() {
    if(!current) return;
    const newSlide={id:Date.now().toString(),type:"content",title:"新投影片",
      content:[{icon:"▸",text:"要點一"},{icon:"▸",text:"要點二"}],notes:""};
    const slides=[...current.slides,newSlide];
    const next={...current,slides};
    setCurrent(next); setActiveIdx(slides.length-1);
    slidesApi.update(id,current.id,{slides}).catch(()=>{});
  }

  function removeSlide(idx:number) {
    if(!current||current.slides.length<=1) return;
    const slides=current.slides.filter((_,i)=>i!==idx);
    const next={...current,slides};
    setCurrent(next); setActiveIdx(Math.min(idx,slides.length-1));
    slidesApi.update(id,current.id,{slides}).catch(()=>{});
  }

  return (
    <ProjectLayout projectId={id} activeTab="slides">
      <div className="flex h-full overflow-hidden">

        {/* ── Left Panel ── */}
        <div className="w-64 shrink-0 border-r border-gray-800 bg-gray-900/40 flex flex-col overflow-y-auto">
          <div className="p-4 space-y-3 border-b border-gray-800">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">AI 簡報生成</p>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">主題 *</label>
              <input value={form.topic} onChange={e=>setForm(f=>({...f,topic:e.target.value}))}
                onKeyDown={e=>e.key==="Enter"&&generate()}
                placeholder="輸入簡報主題..."
                className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-sm focus:outline-none transition-colors"/>
            </div>
            <div className="flex gap-2 items-end">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">張數</label>
                <input type="number" min={5} max={25} value={form.num_slides}
                  onChange={e=>setForm(f=>({...f,num_slides:+e.target.value}))}
                  className="w-full bg-gray-800 border border-gray-700 rounded-xl px-2 py-1.5 text-white text-sm focus:outline-none text-center"/>
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">模板</label>
              <div className="grid grid-cols-3 gap-1.5">
                {TEMPLATES.map(t=>(
                  <button key={t.key} onClick={()=>setForm(f=>({...f,template:t.key}))}
                    className={`p-2 rounded-lg border text-xs transition-colors ${form.template===t.key?"border-indigo-500 bg-indigo-900/20 text-indigo-300":"border-gray-700 text-gray-400 hover:border-gray-600"}`}>
                    <div className="flex gap-0.5 mb-1 justify-center">
                      {t.colors.map((c,i)=><div key={i} className="w-3 h-3 rounded-full" style={{backgroundColor:c}}/>)}
                    </div>
                    <span className="text-[10px]">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">補充說明</label>
              <textarea value={form.extra_context} onChange={e=>setForm(f=>({...f,extra_context:e.target.value}))}
                placeholder="e.g. 醫院管理、Q3 季報..." rows={2}
                className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-xs focus:outline-none resize-none transition-colors"/>
            </div>

            {/* File selector */}
            {files.length>0&&(
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block flex items-center gap-1">
                  <FileText size={11}/> 引用知識庫文件
                </label>
                <div className="max-h-28 overflow-y-auto space-y-1 bg-gray-800/50 rounded-xl p-2">
                  {files.map(f=>(
                    <label key={f.id} className="flex items-center gap-2 cursor-pointer py-0.5 hover:bg-gray-700/30 rounded px-1 transition-colors">
                      <input type="checkbox" checked={selectedFiles.includes(f.id)}
                        onChange={e=>setSelectedFiles(prev=>e.target.checked?[...prev,f.id]:prev.filter(x=>x!==f.id))}
                        className="rounded border-gray-600 bg-gray-800 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-0"/>
                      <span className="text-xs text-gray-300 truncate">{f.original_name}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button onClick={generate} disabled={!form.topic.trim()||generating}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white py-2.5 rounded-xl text-sm font-medium transition-colors">
              {generating?<><Loader size={14} className="animate-spin"/>生成中…</>:<><Wand2 size={14}/>生成簡報</>}
            </button>
          </div>

          {/* History */}
          {presentations.length>0&&(
            <div className="p-3">
              <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-medium">歷史記錄</p>
              <div className="space-y-1.5">
                {presentations.map(p=>(
                  <div key={p.id}
                    className={`flex items-center gap-2 p-2.5 rounded-xl cursor-pointer transition-colors group border ${current?.id===p.id?"bg-indigo-900/20 border-indigo-700/40":"hover:bg-gray-800 border-transparent"}`}
                    onClick={()=>loadPres(p.id)}>
                    <Layers size={13} className="text-gray-500 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white truncate font-medium">{p.title}</p>
                      <p className="text-xs text-gray-600">{p.slide_count} 張 · {p.template}</p>
                    </div>
                    <button onClick={e=>{e.stopPropagation();deletePres(p.id);}}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 text-gray-500 transition-all shrink-0">
                      <Trash2 size={11}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Main Area ── */}
        {current ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Toolbar */}
            <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2 bg-gray-900/20 shrink-0">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <h2 className="font-semibold text-white text-sm truncate">{current.title}</h2>
                <span className="text-xs text-gray-600 shrink-0">{current.slides.length} 張</span>
              </div>
              {slide&&(
                <button onClick={()=>setEditingSlide(slide)}
                  className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors">
                  <Edit2 size={12}/>編輯
                </button>
              )}
              <button onClick={addSlide}
                className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors">
                <Plus size={12}/>新增
              </button>
              <button onClick={download} disabled={downloading}
                className="flex items-center gap-1.5 text-xs bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg font-medium transition-colors">
                {downloading?<Loader size={12} className="animate-spin"/>:<Download size={12}/>}
                下載 PPTX
              </button>
            </div>

            <div className="flex flex-1 overflow-hidden">
              {/* Thumbnails — click only navigates, no edit overlay */}
              <div className="w-36 shrink-0 border-r border-gray-800 overflow-y-auto bg-gray-900/20 p-2 space-y-2">
                {current.slides.map((s,i)=>(
                  <div key={s.id}
                    className={`relative group rounded-lg overflow-hidden border-2 transition-all cursor-pointer ${activeIdx===i?"border-indigo-500 shadow-lg shadow-indigo-900/40":"border-gray-800 hover:border-gray-600"}`}
                    onClick={()=>setActiveIdx(i)}>
                    {/* 16:9 thumbnail */}
                    <div style={{paddingBottom:"56.25%",position:"relative",overflow:"hidden"}}>
                      <div style={{position:"absolute",inset:0,transform:"scale(0.165)",transformOrigin:"top left",
                        width:"606%",height:"606%",pointerEvents:"none"}}>
                        <SlideView slide={s} template={current.template}/>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 px-1.5 py-1 bg-gray-900/80">
                      <span className="text-[10px] text-gray-600">{i+1}</span>
                      <SlideTypeIcon type={s.type}/>
                    </div>
                  </div>
                ))}
              </div>

              {/* Main 16:9 preview */}
              <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gray-950 overflow-auto">
                {slide&&(
                  <>
                    <div className="w-full max-w-4xl rounded-xl overflow-hidden shadow-2xl shadow-black/60"
                      style={{aspectRatio:"16/9"}}>
                      <SlideView slide={slide} template={current.template}/>
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

                    {slide.notes&&(
                      <div className="mt-3 max-w-4xl w-full bg-gray-900 border border-gray-800 rounded-xl px-4 py-3">
                        <p className="text-xs text-gray-500 mb-1 uppercase tracking-wider font-medium">演講備注</p>
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
            <div className="text-center max-w-xs">
              <div className="w-20 h-20 bg-gradient-to-br from-indigo-600 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-indigo-900/40">
                <Wand2 size={32} className="text-white"/>
              </div>
              <p className="text-white font-bold text-lg mb-3">AI 簡報生成器</p>
              <div className="space-y-1.5 text-left">
                {["✔ 自動分章節與排版","✔ 長條圖 / 圓餅圖 / 折線圖","✔ 自動流程圖","✔ Emoji 圖示自動配對","✔ 可互動編輯每張投影片","✔ 下載高品質 PPTX"].map(t=>(
                  <p key={t} className="text-gray-400 text-sm">{t}</p>
                ))}
              </div>
              <p className="text-gray-600 text-xs mt-4">在左側輸入主題開始生成</p>
            </div>
          </div>
        )}
      </div>

      {editingSlide&&current&&(
        <SlideEditor slide={editingSlide} onSave={saveSlide} onClose={()=>setEditingSlide(null)}/>
      )}
    </ProjectLayout>
  );
}
