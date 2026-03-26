"use client";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Bell, Send } from "lucide-react";
import ProjectLayout from "@/components/layout/ProjectLayout";
import { progressApi, notificationsApi, type ProgressData, type NotifSettings } from "@/lib/api";

export default function ProgressPage() {
  const { id } = useParams<{ id: string }>();
  const [progress, setProgress] = useState<ProgressData | null>(null);
  const [settings, setSettings] = useState<NotifSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryMsg, setSummaryMsg] = useState("");

  useEffect(() => {
    Promise.all([progressApi.get(id), notificationsApi.getSettings(id)])
      .then(([p, s]) => { setProgress(p); setSettings(s); })
      .finally(() => setLoading(false));
  }, [id]);

  async function updateSchedule(schedule: "off" | "daily" | "weekly") {
    const updated = await notificationsApi.updateSettings(id, { summary_schedule: schedule });
    setSettings(updated);
  }

  async function triggerSummary() {
    setSummaryLoading(true);
    try {
      const r = await notificationsApi.triggerSummary(id);
      setSummaryMsg(r.message || "摘要已發送");
    } catch (e: any) { setSummaryMsg("失敗：" + e.message); }
    finally { setSummaryLoading(false); }
  }

  if (loading) return <ProjectLayout projectId={id} activeTab="progress"><div className="flex items-center justify-center h-64 text-gray-500">載入中...</div></ProjectLayout>;
  if (!progress) return <ProjectLayout projectId={id} activeTab="progress"><div className="flex items-center justify-center h-64 text-gray-500">無法載入</div></ProjectLayout>;

  const rate = Math.round(progress.completion_rate * 100);
  const statusData = [
    { name: "待辦", value: progress.by_status.todo, color: "#6b7280" },
    { name: "進行中", value: progress.by_status.in_progress, color: "#f59e0b" },
    { name: "完成", value: progress.by_status.done, color: "#10b981" },
    { name: "封存", value: progress.by_status.archived, color: "#374151" },
  ];
  const weekData = [
    { name: "本週新增", value: progress.this_week.created, color: "#6366f1" },
    { name: "本週完成", value: progress.this_week.completed, color: "#10b981" },
  ];

  return (
    <ProjectLayout projectId={id} activeTab="progress">
      <div className="p-4 max-w-2xl mx-auto space-y-5">
        {/* 完成率 */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-white font-semibold">整體完成率</h2>
            <span className="text-2xl font-bold text-indigo-400">{rate}%</span>
          </div>
          <div className="w-full bg-gray-800 rounded-full h-3">
            <div className="bg-indigo-500 h-3 rounded-full transition-all" style={{ width: `${rate}%` }} />
          </div>
          <p className="text-sm text-gray-500 mt-2">{progress.by_status.done} / {progress.total} 項任務完成</p>
        </div>
        {/* 狀態分佈 */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">任務狀態分佈</h2>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={statusData}>
              <XAxis dataKey="name" tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <YAxis tick={{ fill: "#9ca3af", fontSize: 12 }} allowDecimals={false} />
              <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", color: "#fff" }} />
              <Bar dataKey="value" radius={[4,4,0,0]}>
                {statusData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* 本週對比 */}
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
          <h2 className="text-white font-semibold mb-4">本週動態</h2>
          <ResponsiveContainer width="100%" height={110}>
            <BarChart data={weekData} layout="vertical">
              <XAxis type="number" tick={{ fill: "#9ca3af", fontSize: 12 }} allowDecimals={false} />
              <YAxis dataKey="name" type="category" tick={{ fill: "#9ca3af", fontSize: 12 }} width={65} />
              <Tooltip contentStyle={{ background: "#1f2937", border: "1px solid #374151", color: "#fff" }} />
              <Bar dataKey="value" radius={[0,4,4,0]}>
                {weekData.map((e, i) => <Cell key={i} fill={e.color} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {/* 通知設定 */}
        {settings && (
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <Bell size={16} className="text-indigo-400" />
              <h2 className="text-white font-semibold">進度推送設定</h2>
            </div>
            <div className="flex gap-2 mb-4">
              {(["off","daily","weekly"] as const).map(opt => (
                <button key={opt} onClick={() => updateSchedule(opt)}
                  className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${settings.summary_schedule === opt ? "bg-indigo-600 text-white" : "bg-gray-800 text-gray-400 hover:bg-gray-700"}`}>
                  {{"off":"關閉","daily":"每日","weekly":"每週"}[opt]}
                </button>
              ))}
            </div>
            <button onClick={triggerSummary} disabled={summaryLoading}
              className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg text-sm disabled:opacity-50">
              <Send size={14} />{summaryLoading ? "發送中..." : "立即發送摘要"}
            </button>
            {summaryMsg && <p className="text-sm text-gray-400 mt-2">{summaryMsg}</p>}
          </div>
        )}
      </div>
    </ProjectLayout>
  );
}
