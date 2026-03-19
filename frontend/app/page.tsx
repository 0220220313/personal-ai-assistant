"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, FolderOpen, CheckSquare, FileText, Cpu, Archive, Search, X, ChevronRight, Layers } from "lucide-react";
import { projectsApi, type Project } from "@/lib/api";

const GRADIENT_COLORS = [
  "from-indigo-600 to-purple-600",
  "from-purple-600 to-pink-600",
  "from-pink-600 to-rose-600",
  "from-amber-500 to-orange-600",
  "from-emerald-500 to-teal-600",
  "from-blue-600 to-indigo-600",
  "from-red-500 to-pink-600",
];

const COLORS = ["#6366f1","#8b5cf6","#ec4899","#f59e0b","#10b981","#3b82f6","#ef4444"];

function ProjectCard({ project, index }: { project: Project; index: number }) {
  const gradient = GRADIENT_COLORS[index % GRADIENT_COLORS.length];
  return (
    <Link
      href={`/projects/${project.id}/chat`}
      className="group bg-gray-900 hover:bg-gray-800 border border-gray-800 hover:border-gray-700 rounded-2xl p-5 transition-all duration-200 hover:shadow-lg hover:shadow-black/20 hover:-translate-y-0.5 block"
    >
      <div className="flex items-start gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shrink-0 text-white font-bold text-lg shadow-lg`}>
          {project.name.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-white truncate group-hover:text-indigo-300 transition-colors">
            {project.name}
          </h3>
          {project.description && (
            <p className="text-gray-500 text-xs mt-0.5 truncate">{project.description}</p>
          )}
        </div>
        <ChevronRight size={16} className="text-gray-700 group-hover:text-gray-400 transition-colors shrink-0 mt-0.5" />
      </div>

      <div className="flex gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <CheckSquare size={11} />
          {project.tasks_count ?? 0} 任務
        </span>
        <span className="flex items-center gap-1">
          <FileText size={11} />
          {project.files_count ?? 0} 檔案
        </span>
      </div>

      {project.tags && project.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-3">
          {project.tags.slice(0, 3).map(tag => (
            <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-gray-800 text-gray-400">
              {tag}
            </span>
          ))}
        </div>
      )}
    </Link>
  );
}

export default function Dashboard() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [agentOnline, setAgentOnline] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    loadProjects();
    checkAgent();
    const t = setInterval(checkAgent, 30000);
    return () => clearInterval(t);
  }, [showArchived]);

  async function loadProjects() {
    setLoading(true);
    try {
      const data = await projectsApi.list(showArchived);
      setProjects(data);
    } finally {
      setLoading(false);
    }
  }

  async function checkAgent() {
    try {
      const res = await fetch((process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000") + "/api/agent/status");
      const data = await res.json();
      setAgentOnline(data.online);
    } catch {}
  }

  async function createProject() {
    if (!newName.trim()) return;
    try {
      const color = COLORS[projects.length % COLORS.length];
      const p = await projectsApi.create({ name: newName.trim(), description: newDesc.trim(), color });
      setProjects(prev => [p, ...prev]);
      setNewName("");
      setNewDesc("");
      setCreating(false);
    } catch {
      alert("建立失敗，請稍後再試");
    }
  }

  const filtered = projects.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) ||
    (p.description || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-950">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-gray-950/80 backdrop-blur-md border-b border-gray-900">
        <div className="max-w-6xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg flex items-center justify-center">
              <Layers size={16} className="text-white" />
            </div>
            <div>
              <h1 className="text-base font-bold text-white leading-tight">個人 AI 助理</h1>
              <p className="text-gray-500 text-xs">智慧管理 × 知識庫 × 自動化</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              agentOnline ? "bg-green-900/40 text-green-400" : "bg-gray-800 text-gray-500"
            }`}>
              <div className={`w-1.5 h-1.5 rounded-full ${agentOnline ? "bg-green-400 animate-pulse" : "bg-gray-600"}`} />
              {agentOnline ? "Agent 上線" : "Agent 離線"}
            </div>
            <Link
              href="/command"
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 hover:text-white px-3 py-1.5 rounded-lg text-sm transition-colors"
            >
              <Cpu size={14} />
              <span className="hidden sm:inline">指令中心</span>
            </Link>
            <button
              onClick={() => setCreating(true)}
              className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            >
              <Plus size={14} />
              <span className="hidden sm:inline">新增專案</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 md:px-8 py-6">
        {/* Create project form */}
        {creating && (
          <div className="bg-gray-900 border border-indigo-500/50 rounded-2xl p-5 mb-6 shadow-lg shadow-indigo-900/10">
            <h2 className="text-sm font-semibold text-white mb-4">建立新專案</h2>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">專案名稱 *</label>
                <input
                  autoFocus
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && createProject()}
                  placeholder="我的新專案"
                  className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">描述（選填）</label>
                <input
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="簡單描述此專案..."
                  className="w-full bg-gray-800 border border-gray-700 focus:border-indigo-500 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none transition-colors"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={createProject}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-sm font-medium transition-colors"
                >
                  建立專案
                </button>
                <button
                  onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); }}
                  className="bg-gray-800 hover:bg-gray-700 text-gray-300 px-5 py-2 rounded-xl text-sm transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Search + filter bar */}
        <div className="flex gap-3 mb-6">
          <div className="relative flex-1">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="搜尋專案..."
              className="w-full bg-gray-900 border border-gray-800 rounded-xl pl-9 pr-4 py-2.5 text-sm text-white focus:outline-none focus:border-gray-600 transition-colors"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white">
                <X size={14} />
              </button>
            )}
          </div>
          <button
            onClick={() => setShowArchived(a => !a)}
            className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm border transition-colors ${
              showArchived
                ? "bg-indigo-900/20 border-indigo-700/50 text-indigo-300"
                : "bg-gray-900 border-gray-800 text-gray-500 hover:text-white hover:border-gray-700"
            }`}
          >
            <Archive size={14} />
            <span className="hidden sm:inline">封存</span>
          </button>
        </div>

        {/* Project grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="bg-gray-900 border border-gray-800 rounded-2xl p-5 animate-pulse">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 bg-gray-800 rounded-xl" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-800 rounded w-3/4" />
                    <div className="h-3 bg-gray-800 rounded w-1/2" />
                  </div>
                </div>
                <div className="h-3 bg-gray-800 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <FolderOpen size={28} className="text-gray-600" />
            </div>
            <p className="text-gray-400 font-medium">
              {search ? "沒有符合的專案" : showArchived ? "沒有封存的專案" : "還沒有任何專案"}
            </p>
            {!search && !showArchived && (
              <button
                onClick={() => setCreating(true)}
                className="mt-4 text-indigo-400 hover:text-indigo-300 text-sm transition-colors"
              >
                建立第一個專案 →
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((project, i) => (
              <ProjectCard key={project.id} project={project} index={i} />
            ))}
          </div>
        )}

        {/* Stats footer */}
        {!loading && projects.length > 0 && (
          <div className="mt-8 pt-6 border-t border-gray-900 flex items-center justify-between text-xs text-gray-600">
            <span>{filtered.length} 個專案</span>
            <span>個人 AI 助理 · {new Date().getFullYear()}</span>
          </div>
        )}
      </main>
    </div>
  );
}
