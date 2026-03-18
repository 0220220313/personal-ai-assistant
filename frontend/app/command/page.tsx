"use client";
import { useEffect, useRef, useState } from "react";
import { Send, Cpu, ArrowLeft, Clock, CheckCircle, XCircle, Loader } from "lucide-react";
import Link from "next/link";
import { agentApi, type AgentCommand } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const QUICK_COMMANDS = [
  "列出桌面上所有檔案",
  "取得系統資訊",
  "在桌面建立「工作區」資料夾",
  "搜尋 C:\\Users 中的所有 PDF 檔案",
  "顯示目前正在執行的程序",
];

export default function CommandPage() {
  const [commands, setCommands] = useState<AgentCommand[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [agentOnline, setAgentOnline] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    loadCommands();
    connectWS();
    return () => wsRef.current?.close();
  }, []);

  async function loadCommands() {
    const data = await agentApi.listCommands();
    setCommands(data);
    const status = await agentApi.status();
    setAgentOnline(status.online);
  }

  function connectWS() {
    const ws = new WebSocket(
      `${process.env.NEXT_PUBLIC_API_URL?.replace("http", "ws") || "ws://localhost:8000"}/api/agent/ws/monitor`
    );
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.type === "agent_status") setAgentOnline(data.online);
      if (data.type === "command_result") {
        setCommands(prev => prev.map(c =>
          c.id === data.id ? { ...c, status: data.status, result: data.result } : c
        ));
      }
    };
    wsRef.current = ws;
  }

  async function sendCommand(cmd?: string) {
    const command = cmd || input.trim();
    if (!command || sending) return;
    setSending(true);
    setInput("");
    try {
      const result = await agentApi.sendCommand(command);
      setCommands(prev => [{
        id: result.id, command, status: result.status,
        result: "", created_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }, ...prev]);
    } finally {
      setSending(false);
    }
  }

  const StatusIcon = ({ status }: { status: string }) => {
    if (status === "done") return <CheckCircle size={14} className="text-green-400" />;
    if (status === "error") return <XCircle size={14} className="text-red-400" />;
    if (status === "running") return <Loader size={14} className="text-yellow-400 animate-spin" />;
    return <Clock size={14} className="text-gray-500" />;
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900">
        <Link href="/" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <Cpu size={18} className="text-indigo-400" />
        <h1 className="font-semibold text-white">AI 指令中心</h1>
        <div className={`ml-auto flex items-center gap-1.5 px-3 py-1 rounded-full text-xs ${
          agentOnline ? "bg-green-900/40 text-green-400" : "bg-gray-800 text-gray-500"
        }`}>
          <div className={`w-1.5 h-1.5 rounded-full ${agentOnline ? "bg-green-400" : "bg-gray-500"}`} />
          {agentOnline ? "Agent 上線" : "Agent 離線"}
        </div>
      </header>

      <div className="flex-1 max-w-3xl mx-auto w-full p-4 flex flex-col gap-4">
        {/* 快速指令 */}
        <div>
          <p className="text-xs text-gray-500 mb-2">快速指令</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_COMMANDS.map(cmd => (
              <button key={cmd} onClick={() => sendCommand(cmd)}
                className="bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-300 text-xs px-3 py-1.5 rounded-full transition-all">
                {cmd}
              </button>
            ))}
          </div>
        </div>

        {/* 指令輸入 */}
        <div className="flex gap-2">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && sendCommand()}
            placeholder="輸入自然語言指令，例如：整理桌面 PDF 到「文件」資料夾..."
            className="flex-1 bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-indigo-500 transition-colors"
          />
          <button onClick={() => sendCommand()} disabled={sending || !input.trim()}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white px-4 rounded-xl transition-colors">
            <Send size={16} />
          </button>
        </div>

        {/* 執行記錄 */}
        <div className="space-y-3">
          {commands.length === 0 ? (
            <div className="text-center text-gray-600 py-12">
              <Cpu size={40} className="mx-auto mb-3 opacity-20" />
              <p>發送指令後，結果將在此顯示</p>
            </div>
          ) : commands.map(cmd => (
            <div key={cmd.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-800">
                <StatusIcon status={cmd.status} />
                <p className="text-sm text-white flex-1">{cmd.command}</p>
                <span className="text-xs text-gray-500">
                  {new Date(cmd.created_at).toLocaleTimeString("zh-TW")}
                </span>
              </div>
              {cmd.result && (
                <div className="px-4 py-3">
                  <div className="markdown-body text-xs text-gray-300">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{cmd.result}</ReactMarkdown>
                  </div>
                </div>
              )}
              {(cmd.status === "pending" || cmd.status === "running") && !cmd.result && (
                <div className="px-4 py-3">
                  <div className="flex gap-1">
                    {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-gray-600 typing-dot" />)}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
