"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { FileBarChart, Trash2, Download, Loader } from "lucide-react";
import { reportsApi, type Report } from "@/lib/api";
import ProjectLayout from "@/components/layout/ProjectLayout";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const TYPES = [
  { key: "progress", label: "進度報告", icon: "📊" },
  { key: "meeting",  label: "會議紀錄", icon: "📝" },
  { key: "risk",     label: "風險分析", icon: "⚠️" },
  { key: "weekly",   label: "週報",     icon: "📅" },
];

export default function ReportsPage() {
  const { id } = useParams<{ id: string }>();
  const [reports, setReports] = useState<Report[]>([]);
  const [generating, setGenerating] = useState(false);
  const [selectedType, setSelectedType] = useState("progress");
  const [extraContext, setExtraContext] = useState("");
  const [activeReport, setActiveReport] = useState<Report | null>(null);

  useEffect(() => { loadReports(); }, [id]);

  async function loadReports() {
    const data = await reportsApi.list(id);
    setReports(data);
  }

  async function generate() {
    setGenerating(true);
    try {
      const report = await reportsApi.generate(id, selectedType, extraContext);
      setReports(prev => [report, ...prev]);
      setActiveReport(report);
      setExtraContext("");
    } catch (e: any) {
      alert("生成失敗: " + e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function deleteReport(reportId: string) {
    await reportsApi.delete(reportId);
    setReports(prev => prev.filter(r => r.id !== reportId));
    if (activeReport?.id === reportId) setActiveReport(null);
  }

  function downloadReport(report: Report) {
    const blob = new Blob([report.content], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${report.title}.md`;
    a.click();
  }

  return (
    <ProjectLayout projectId={id} activeTab="reports">
      <div className="flex h-full">
        {/* 左側：生成面板 + 歷史 */}
        <div className="w-72 shrink-0 border-r border-gray-800 flex flex-col">
          <div className="p-4 border-b border-gray-800">
            <p className="text-sm text-gray-400 mb-3">報告類型</p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {TYPES.map(t => (
                <button key={t.key} onClick={() => setSelectedType(t.key)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    selectedType === t.key ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"
                  }`}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            {selectedType === "meeting" && (
              <textarea
                value={extraContext}
                onChange={e => setExtraContext(e.target.value)}
                placeholder="貼上會議原始紀錄..."
                rows={4}
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-xs text-white resize-none focus:outline-none focus:border-indigo-500 mb-3"
              />
            )}
            <button onClick={generate} disabled={generating}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2 rounded-lg text-sm font-medium transition-colors">
              {generating ? <><Loader size={14} className="animate-spin" /> 生成中...</> : <>✨ 生成報告</>}
            </button>
          </div>

          {/* 歷史報告 */}
          <div className="flex-1 overflow-y-auto p-2">
            {reports.length === 0 ? (
              <p className="text-center text-gray-600 text-xs mt-8">尚無報告</p>
            ) : (
              reports.map(r => (
                <button key={r.id} onClick={() => setActiveReport(r)}
                  className={`w-full text-left p-3 rounded-lg mb-1 transition-all group ${
                    activeReport?.id === r.id ? "bg-indigo-900/40 border border-indigo-700" : "hover:bg-gray-800"
                  }`}>
                  <p className="text-sm text-gray-300 truncate">{r.title}</p>
                  <p className="text-xs text-gray-600 mt-0.5">{new Date(r.created_at).toLocaleDateString("zh-TW")}</p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* 右側：報告內容 */}
        <div className="flex-1 overflow-y-auto">
          {activeReport ? (
            <div className="p-6 max-w-3xl">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-semibold text-white">{activeReport.title}</h2>
                <div className="flex gap-2">
                  <button onClick={() => downloadReport(activeReport)}
                    className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded-lg text-xs transition-colors">
                    <Download size={12} /> 下載
                  </button>
                  <button onClick={() => deleteReport(activeReport.id)}
                    className="flex items-center gap-1.5 bg-red-900/30 hover:bg-red-900/50 text-red-400 px-3 py-1.5 rounded-lg text-xs transition-colors">
                    <Trash2 size={12} /> 刪除
                  </button>
                </div>
              </div>
              <div className="markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{activeReport.content}</ReactMarkdown>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-gray-600">
              <div className="text-center">
                <FileBarChart size={48} className="mx-auto mb-3 opacity-20" />
                <p>選擇報告查看內容，或生成新報告</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </ProjectLayout>
  );
}
