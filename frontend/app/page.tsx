"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FolderOpen, CheckSquare, FileText, Cpu, Archive } from "lucide-react";
import { projectsApi, type Project } from "@/lib/api";

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [agentOnline, setAgentOnline] = useState(false);

  useEffect(() => {
    loadProjects();
    checkAgent();
  }, []);

  async function loadProjects() {
    try {
      const data = await projectsApi.list();
      setProjects(data);
    } finally {
      setLoading(false);
    }
  }

  async function checkAgent() {
    try {
      const res = await fetch("/api/agent/status");
      const data = await res.json();
      setAgentOnline(data.online);
    } catch {}
  }

  async function createProject() {
    if (!newName.trim()) return;
    try {
      const p = await projectsApi.create({ name: newName.trim() });
      setProjects(prev => [p, ...prev]);
      setNewName("");
      setCreating(false);
    } catch (e) {
      alert("建立失敗");
    }
  }

  const COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444"];

  return (
    <div className="min-h-screen bg-gray-950 p-4 md:p-8">
      {/* Header */}
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold text-white">🤖 個人 AI 助理</h1>
            <p className="text-gray-400 text-sm mt-1">智慧專案管理 × 知識庫 × 自動化執行</p>
          </div>
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${agentOnline ? "bg-green-900/40 text-green-400" : "bg-gray-800 text-gray-500"}`}>
              <Cpu size={12} />
              {agentOnline ? "Agent 上線" : "Agent 離線"}
            </div>
            <Link href="/command" className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
              <Cpu size={14} /> 指令中心
            </Link>
          </div>
        </div>

        {/* 新增專案 */}
        {creating ? (
          <div className="bg-gray-900 border border-indigo-500 rounded-xl p-4 mb-6">
            <p className="text-sm text-gray-400 mb-2">專案名稱</p>
            <input
              autoFocus
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === "Enter" && createProject()}
              placeholder="輸入專案名稱..."
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500 mb-3"
            />
            <div className="flex gap-2">
              <button onClick={createProject} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm transition-colors">建立</button>
              <button onClick={() => setCreating(false)} className="bg-gray-700 hover:bg-gray-600 text-gray-300 px-4 py-1.5 rounded-lg text-sm transition-colors">取消</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 w-full bg-gray-900 hover:bg-gray-800 border border-dashed border-gray-700 hover:border-indigo-500 rounded-xl p-4 mb-6 text-gray-400 hover:text-indigo-400 transition-all"
          >
            <Plus size={18} /> 建立新專案
          </button>
        )}

        {/* 專案列表 */}
        {loading ? (
          <div className="text-center text-gray-500 py-20">載入中...</div>
        ) : projects.length === 0 ? (
          <div className="text-center text-gray-500 py-20">
            <FolderOpen size={48} className="mx-auto mb-3 opacity-30" />
            <p>還沒有專案，建立第一個吧！</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => (
              <Link key={p.id} href={`/projects/${p.id}/chat`}>
                <div className="bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-600 rounded-xl p-5 transition-all cursor-pointer group">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
                      <h3 className="font-semibold text-white group-hover:text-indigo-300 transition-colors">{p.name}</h3>
                    </div>
                  </div>
                  {p.description && <p className="text-gray-400 text-sm mb-3 line-clamp-2">{p.description}</p>}
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><CheckSquare size={11} /> {p.tasks_count ?? 0} 任務</span>
                    <span className="flex items-center gap-1"><FileText size={11} /> {p.files_count ?? 0} 檔案</span>
                  </div>
                  {p.tags?.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-3">
                      {p.tags.map(t => (
                        <span key={t} className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full">{t}</span>
                      ))}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
