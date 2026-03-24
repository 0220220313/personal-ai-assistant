"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Brain, Plus, Trash2, RefreshCw } from "lucide-react";
import { memoryApi, type ProjectMemory } from "@/lib/api";
import ProjectLayout from "@/components/layout/ProjectLayout";

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function MemoryPage() {
  const { id } = useParams<{ id: string }>();
  const [memories, setMemories] = useState<ProjectMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadMemories();
  }, [id]);

  // SSE listener for memory_saved events
  useEffect(() => {
    const es = new EventSource(`${BASE}/api/chat/events/${id}`);
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "action" && data.action === "memory_saved") {
          loadMemories();
        }
      } catch {}
    };
    return () => es.close();
  }, [id]);

  async function loadMemories() {
    setLoading(true);
    try {
      const mems = await memoryApi.list(id);
      setMemories(mems);
    } finally {
      setLoading(false);
    }
  }

  async function addMemory(e: React.FormEvent) {
    e.preventDefault();
    if (!newKey.trim() || !newValue.trim()) return;
    setSaving(true);
    try {
      await memoryApi.upsert(id, newKey.trim(), newValue.trim());
      setNewKey("");
      setNewValue("");
      await loadMemories();
    } finally {
      setSaving(false);
    }
  }

  async function deleteMemory(key: string) {
    if (!confirm(`確定要刪除記憶「${key}」嗎？`)) return;
    await memoryApi.delete(id, key);
    setMemories((prev) => prev.filter((m) => m.key !== key));
  }

  async function clearAll() {
    if (!confirm("確定要清除所有記憶嗎？此操作不可復原。")) return;
    await memoryApi.clear(id);
    setMemories([]);
  }

  function formatDate(dateStr: string) {
    try {
      return new Date(dateStr).toLocaleString("zh-TW", {
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return dateStr;
    }
  }

  return (
    <ProjectLayout projectId={id} activeTab="memory">
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Brain size={22} className="text-purple-400" />
            <div>
              <h2 className="text-lg font-semibold text-white">專案記憶</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                AI 在對話中記住的重要資訊
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={loadMemories}
              className="p-2 text-gray-500 hover:text-gray-300 hover:bg-gray-800 rounded-lg transition-colors"
              title="重新整理"
            >
              <RefreshCw size={15} />
            </button>
            {memories.length > 0 && (
              <button
                onClick={clearAll}
                className="text-xs px-3 py-1.5 text-red-400 border border-red-800/50 hover:bg-red-900/20 rounded-lg transition-colors"
              >
                清除全部
              </button>
            )}
          </div>
        </div>

        {/* Add memory form */}
        <form onSubmit={addMemory} className="bg-gray-900 border border-gray-800 rounded-xl p-4 mb-6">
          <p className="text-xs text-gray-400 font-medium mb-3 flex items-center gap-1.5">
            <Plus size={12} />
            新增記憶
          </p>
          <div className="flex gap-2 mb-2">
            <input
              type="text"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="Key（如：使用者偏好）"
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div className="flex gap-2">
            <textarea
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              placeholder="Value（記憶內容）"
              rows={2}
              className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors resize-none"
            />
            <button
              type="submit"
              disabled={saving || !newKey.trim() || !newValue.trim()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm rounded-lg transition-colors self-end"
            >
              {saving ? "儲存中..." : "儲存"}
            </button>
          </div>
        </form>

        {/* Memory list */}
        {loading ? (
          <div className="text-center text-gray-600 py-12">載入中...</div>
        ) : memories.length === 0 ? (
          <div className="text-center text-gray-600 py-16">
            <Brain size={36} className="mx-auto mb-3 opacity-20" />
            <p className="text-sm">還沒有記憶</p>
            <p className="text-xs mt-1 text-gray-700">對話時 AI 可以自動記住重要資訊，或手動新增上方</p>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-gray-600 mb-3">{memories.length} 則記憶</p>
            {memories.map((m) => (
              <div
                key={m.id}
                className="group bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="text-xs font-semibold text-purple-400 truncate">
                        {m.key}
                      </span>
                      <span className="text-[10px] text-gray-600 shrink-0">
                        {formatDate(m.updated_at)}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                      {m.value}
                    </p>
                  </div>
                  <button
                    onClick={() => deleteMemory(m.key)}
                    className="shrink-0 p-1.5 text-gray-700 hover:text-red-400 hover:bg-red-900/20 rounded-lg opacity-0 group-hover:opacity-100 transition-all"
                    title="刪除此記憶"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </ProjectLayout>
  );
}
