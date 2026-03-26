"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Plus, Sparkles, Trash2, GripVertical } from "lucide-react";
import { tasksApi, type Task } from "@/lib/api";
import ProjectLayout from "@/components/layout/ProjectLayout";

const COLUMNS = [
  { key: "todo",        label: "待辦",   color: "border-gray-600" },
  { key: "in_progress", label: "進行中", color: "border-yellow-600" },
  { key: "done",        label: "完成",   color: "border-green-600" },
] as const;

const PRIORITY_COLOR = { high: "text-red-400", medium: "text-yellow-400", low: "text-gray-400" };
const PRIORITY_LABEL = { high: "高", medium: "中", low: "低" };

export default function TasksPage() {
  const { id } = useParams<{ id: string }>();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [aiText, setAiText] = useState("");
  const [showAI, setShowAI] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => { loadTasks(); }, [id]);

  async function loadTasks() {
    const data = await tasksApi.list(id);
    setTasks(data);
  }

  async function addTask(status: string) {
    if (!newTitle.trim()) return;
    await tasksApi.create(id, { title: newTitle.trim(), status: status as Task["status"] });
    setNewTitle("");
    setAdding(null);
    loadTasks();
  }

  async function moveTask(taskId: string, newStatus: string) {
    await tasksApi.update(taskId, { status: newStatus as Task["status"] });
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus as Task["status"] } : t));
  }

  async function deleteTask(taskId: string) {
    await tasksApi.delete(taskId);
    setTasks(prev => prev.filter(t => t.id !== taskId));
  }

  async function aiGenerate() {
    if (!aiText.trim()) return;
    setAiLoading(true);
    try {
      const result = await tasksApi.aiGenerate(id, aiText) as { created: number };
      alert(`AI 已自動建立 ${(result as any).created} 個任務`);
      setAiText("");
      setShowAI(false);
      loadTasks();
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <ProjectLayout projectId={id} activeTab="tasks">
      <div className="h-full overflow-auto p-4">
        {/* AI 生成任務 */}
        <div className="mb-4">
          {showAI ? (
            <div className="bg-gray-900 border border-indigo-500 rounded-xl p-4">
              <p className="text-sm text-gray-400 mb-2">貼上文字讓 AI 自動提取任務</p>
              <textarea
                value={aiText}
                onChange={e => setAiText(e.target.value)}
                rows={4}
                placeholder="例如：貼上會議記錄、需求文件..."
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white resize-none focus:outline-none focus:border-indigo-500 mb-3"
              />
              <div className="flex gap-2">
                <button onClick={aiGenerate} disabled={aiLoading}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white px-4 py-1.5 rounded-lg text-sm transition-colors">
                  <Sparkles size={14} /> {aiLoading ? "分析中..." : "AI 提取任務"}
                </button>
                <button onClick={() => setShowAI(false)} className="bg-gray-700 text-gray-300 px-4 py-1.5 rounded-lg text-sm">取消</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowAI(true)}
              className="flex items-center gap-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 px-3 py-2 rounded-lg text-sm transition-colors">
              <Sparkles size={14} className="text-indigo-400" /> AI 自動提取任務
            </button>
          )}
        </div>

        {/* 看板 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 min-h-[400px]">
          {COLUMNS.map(col => {
            const colTasks = tasks.filter(t => t.status === col.key);
            return (
              <div key={col.key} className={`bg-gray-900 rounded-xl border-t-2 ${col.color} p-4`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-gray-300 text-sm">{col.label}</h3>
                  <span className="bg-gray-800 text-gray-400 text-xs px-2 py-0.5 rounded-full">{colTasks.length}</span>
                </div>

                <div className="space-y-2 min-h-[100px]">
                  {colTasks.map(task => (
                    <div key={task.id} className={`bg-gray-800 border rounded-lg p-3 group ${task.is_milestone ? "border-yellow-500/50" : "border-gray-700"}`}>
                      {task.is_milestone && <span className="text-xs text-yellow-400 mb-1 inline-flex items-center gap-1">🏁 里程碑</span>}
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm text-white leading-snug">{task.title}</p>
                        <div className="flex items-center gap-1 shrink-0">
                          <button onClick={() => { tasksApi.update(task.id, { is_milestone: !task.is_milestone }).then(loadTasks); }}
                            className={`text-xs px-2 py-0.5 rounded ${task.is_milestone ? "text-yellow-400 bg-yellow-900/30" : "text-gray-600 hover:text-gray-400"}`}
                            title="切換里程碑">🏁</button>
                          <button onClick={() => deleteTask(task.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-500 hover:text-red-400 transition-all">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                      {task.description && <p className="text-xs text-gray-500 mt-1 line-clamp-2">{task.description}</p>}
                      <div className="flex items-center justify-between mt-2">
                        <span className={`text-xs font-medium ${PRIORITY_COLOR[task.priority]}`}>
                          {PRIORITY_LABEL[task.priority]}優先
                        </span>
                        <div className="flex gap-1">
                          {COLUMNS.filter(c => c.key !== col.key).map(c => (
                            <button key={c.key} onClick={() => moveTask(task.id, c.key)}
                              className="text-xs text-gray-600 hover:text-gray-300 px-1.5 py-0.5 rounded hover:bg-gray-700 transition-colors">
                              → {c.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* 新增任務 */}
                {adding === col.key ? (
                  <div className="mt-2">
                    <input
                      autoFocus
                      value={newTitle}
                      onChange={e => setNewTitle(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter") addTask(col.key); if (e.key === "Escape") { setAdding(null); setNewTitle(""); } }}
                      placeholder="任務名稱..."
                      className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1.5 text-sm text-white focus:outline-none focus:border-indigo-500 mb-1"
                    />
                    <div className="flex gap-1">
                      <button onClick={() => addTask(col.key)} className="bg-indigo-600 text-white text-xs px-2 py-1 rounded">新增</button>
                      <button onClick={() => { setAdding(null); setNewTitle(""); }} className="text-gray-400 text-xs px-2 py-1">取消</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAdding(col.key)}
                    className="flex items-center gap-1 text-gray-600 hover:text-gray-400 text-xs mt-2 w-full py-1 transition-colors">
                    <Plus size={13} /> 新增任務
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </ProjectLayout>
  );
}
