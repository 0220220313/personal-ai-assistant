"use client";
import { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Send, Trash2, Sparkles, ChevronDown, ChevronUp,
  Brain, CheckSquare, Terminal, BookmarkPlus, Cpu, Paperclip, X,
} from "lucide-react";
import {
  chatApi, filesApi, memoryApi, streamChat,
  type Message, type File, type ProjectMemory, type SSEEvent,
} from "@/lib/api";
import ProjectLayout from "@/components/layout/ProjectLayout";

// ─── Action Card ─────────────────────────────────────────
interface ActionCardProps {
  action: string;
  data: Record<string, unknown>;
}
function ActionCard({ action, data }: ActionCardProps) {
  if (action === "task_created") {
    return (
      <div className="inline-flex items-center gap-2 bg-green-900/40 border border-green-700/50 text-green-300 rounded-xl px-3 py-2 text-xs my-1">
        <CheckSquare size={13} className="shrink-0" />
        <span>已建立任務：<strong>{String(data.title)}</strong></span>
        {data.status != null && (
          <span className="bg-green-800/60 px-1.5 py-0.5 rounded text-green-400">{String(data.status)}</span>
        )}
      </div>
    );
  }
  if (action === "command_sent") {
    return (
      <div className="inline-flex items-center gap-2 bg-blue-900/40 border border-blue-700/50 text-blue-300 rounded-xl px-3 py-2 text-xs my-1">
        <Terminal size={13} className="shrink-0" />
        <span>已發送指令：<strong>{String(data.command)}</strong></span>
        <span className={`px-1.5 py-0.5 rounded text-xs ${data.agent_online ? "bg-green-800/60 text-green-400" : "bg-gray-700 text-gray-400"}`}>
          {data.agent_online ? "Agent 上線" : "已排隊"}
        </span>
      </div>
    );
  }
  if (action === "memory_saved") {
    return (
      <div className="inline-flex items-center gap-2 bg-purple-900/40 border border-purple-700/50 text-purple-300 rounded-xl px-3 py-2 text-xs my-1">
        <Brain size={13} className="shrink-0" />
        <span>已記住：<strong>{String(data.key)}</strong> = {String(data.value)}</span>
      </div>
    );
  }
  return null;
}

// ─── In-flight Action Events ─────────────────────────────
interface PendingAction {
  action: string;
  data: Record<string, unknown>;
}

// ─── Quick Commands ───────────────────────────────────────
const QUICK_COMMANDS = [
  { label: "建立任務", icon: <CheckSquare size={12} />, text: "請幫我建立一個任務：" },
  { label: "執行指令", icon: <Cpu size={12} />, text: "請在電腦上執行：" },
  { label: "記住這個", icon: <BookmarkPlus size={12} />, text: "請記住：" },
];

// ─── Main Component ───────────────────────────────────────
export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [memories, setMemories] = useState<ProjectMemory[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const [pendingActions, setPendingActions] = useState<PendingAction[]>([]);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [filePopoverOpen, setFilePopoverOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText, pendingActions]);

  // Close popover on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setFilePopoverOpen(false);
      }
    }
    if (filePopoverOpen) {
      document.addEventListener("mousedown", handleClick);
    }
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filePopoverOpen]);

  async function loadData() {
    const [msgs, fls, mems] = await Promise.all([
      chatApi.getHistory(id),
      filesApi.list(id),
      memoryApi.list(id).catch(() => [] as ProjectMemory[]),
    ]);
    setMessages(msgs);
    setFiles(fls.filter((f) => f.is_indexed));
    setMemories(mems);
  }

  async function sendMessage() {
    if (!input.trim() || isStreaming) return;
    const text = input.trim();
    setInput("");
    setIsStreaming(true);
    setStreamingText("");
    setPendingActions([]);

    const tempUserMsg: Message = {
      id: "temp-user",
      role: "user",
      content: text,
      file_refs: selectedFiles,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, tempUserMsg]);

    try {
      const res = await streamChat(id, text, selectedFiles);
      if (!res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      const newActions: PendingAction[] = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter((l) => l.startsWith("data: "));

        for (const line of lines) {
          try {
            const raw = line.replace(/^data: /, "");
            const data: SSEEvent = JSON.parse(raw);

            if (data.type === "text") {
              accumulated += data.content;
              setStreamingText(accumulated);
            } else if (data.type === "action") {
              const pa: PendingAction = { action: data.action, data: data.data };
              newActions.push(pa);
              setPendingActions([...newActions]);
              if (data.action === "memory_saved") {
                memoryApi.list(id).then(setMemories).catch(() => {});
              }
            } else if (data.type === "done") {
              await loadData();
              setStreamingText("");
              setPendingActions([]);
            }
          } catch {
            try {
              const raw = line.replace(/^data: /, "");
              const data = JSON.parse(raw);
              if (data.text) {
                accumulated += data.text;
                setStreamingText(accumulated);
              }
              if (data.done) {
                await loadData();
                setStreamingText("");
                setPendingActions([]);
              }
            } catch {}
          }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setIsStreaming(false);
      setSelectedFiles([]);
    }
  }

  async function clearHistory() {
    if (!confirm("確定要清除所有對話嗎？")) return;
    await chatApi.clearHistory(id);
    setMessages([]);
  }

  async function deleteMemory(key: string) {
    await memoryApi.delete(id, key);
    setMemories((prev) => prev.filter((m) => m.key !== key));
  }

  function toggleFile(fileId: string) {
    setSelectedFiles((prev) =>
      prev.includes(fileId) ? prev.filter((x) => x !== fileId) : [...prev, fileId]
    );
  }

  const selectedFileObjects = files.filter((f) => selectedFiles.includes(f.id));

  return (
    <ProjectLayout projectId={id} activeTab="chat">
      <div className="flex h-full overflow-hidden">
        {/* ── 主聊天區 ── */}
        <div className="flex flex-col flex-1 min-w-0">
          {/* 訊息區域 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !streamingText && (
              <div className="text-center text-gray-500 mt-20">
                <Sparkles size={40} className="mx-auto mb-3 opacity-30" />
                <p>開始與 AI 助理對話吧！</p>
                <p className="text-xs mt-2 text-gray-600">
                  可以說「建立任務」「執行指令」「記住這個」
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "assistant" && (
                  <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs mr-2 mt-1 shrink-0">
                    AI
                  </div>
                )}
                <div
                  className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-br-sm"
                      : "bg-gray-800 text-gray-100 rounded-bl-sm"
                  }`}
                >
                  {msg.role === "user" ? (
                    <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  ) : (
                    <div className="markdown-body text-sm">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {pendingActions.length > 0 && (
              <div className="flex justify-start">
                <div className="ml-9 flex flex-col gap-1">
                  {pendingActions.map((pa, i) => (
                    <ActionCard key={i} action={pa.action} data={pa.data} />
                  ))}
                </div>
              </div>
            )}

            {streamingText && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs mr-2 mt-1 shrink-0">
                  AI
                </div>
                <div className="max-w-[80%] bg-gray-800 text-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="markdown-body text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {streamingText}
                    </ReactMarkdown>
                  </div>
                  <div className="flex gap-1 mt-2">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-indigo-400 typing-dot"
                        style={{ animationDelay: `${i * 0.2}s` }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            )}

            {isStreaming && !streamingText && pendingActions.length === 0 && (
              <div className="flex justify-start">
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs mr-2 mt-1 shrink-0">
                  AI
                </div>
                <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div key={i} className="w-2 h-2 rounded-full bg-gray-500 typing-dot" />
                    ))}
                  </div>
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>

          {/* 快速指令 */}
          <div className="px-4 pt-2 flex gap-2 flex-wrap">
            {QUICK_COMMANDS.map((cmd) => (
              <button
                key={cmd.label}
                onClick={() => setInput((prev) => prev + cmd.text)}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-gray-800 border border-gray-700 text-gray-400 rounded-full hover:border-gray-500 hover:text-gray-300 transition-all"
              >
                {cmd.icon}
                {cmd.label}
              </button>
            ))}
          </div>

          {/* 輸入區 */}
          <div className="p-4 border-t border-gray-800">
            {/* 已選文件 chips */}
            {selectedFileObjects.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {selectedFileObjects.map((f) => (
                  <span
                    key={f.id}
                    className="inline-flex items-center gap-1 text-xs bg-indigo-900/60 border border-indigo-700/60 text-indigo-300 rounded-full px-2.5 py-1"
                  >
                    📄 {f.original_name}
                    <button
                      onClick={() => toggleFile(f.id)}
                      className="ml-0.5 text-indigo-400 hover:text-white transition-colors"
                    >
                      <X size={10} />
                    </button>
                  </span>
                ))}
              </div>
            )}

            <div className="flex items-end gap-2">
              {/* 迴紋針按鈕 + Popover */}
              {files.length > 0 && (
                <div className="relative" ref={popoverRef}>
                  <button
                    onClick={() => setFilePopoverOpen((v) => !v)}
                    className={`p-3 rounded-xl transition-colors ${
                      filePopoverOpen || selectedFiles.length > 0
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-800 text-gray-400 hover:text-gray-300 hover:bg-gray-700"
                    }`}
                    title="選取知識庫文件"
                  >
                    <Paperclip size={16} />
                    {selectedFiles.length > 0 && (
                      <span className="absolute -top-1 -right-1 bg-indigo-500 text-white text-[10px] w-4 h-4 rounded-full flex items-center justify-center font-bold">
                        {selectedFiles.length}
                      </span>
                    )}
                  </button>

                  {filePopoverOpen && (
                    <div className="absolute bottom-full mb-2 left-0 w-72 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-20 overflow-hidden">
                      <div className="px-3 py-2 border-b border-gray-700 text-xs text-gray-400 font-medium">
                        選取知識庫文件（可多選）
                      </div>
                      <div className="max-h-56 overflow-y-auto p-2 space-y-1">
                        {files.map((f) => (
                          <button
                            key={f.id}
                            onClick={() => toggleFile(f.id)}
                            className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-colors ${
                              selectedFiles.includes(f.id)
                                ? "bg-indigo-600/30 border border-indigo-600/50 text-indigo-200"
                                : "text-gray-300 hover:bg-gray-700"
                            }`}
                          >
                            <span className="shrink-0">
                              {selectedFiles.includes(f.id) ? "✅" : "📄"}
                            </span>
                            <span className="truncate">{f.original_name}</span>
                          </button>
                        ))}
                      </div>
                      {selectedFiles.length > 0 && (
                        <div className="px-3 py-2 border-t border-gray-700">
                          <button
                            onClick={() => setSelectedFiles([])}
                            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
                          >
                            清除所有選取
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden focus-within:border-indigo-500 transition-colors">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  placeholder="輸入訊息... (Enter 發送，Shift+Enter 換行)"
                  rows={1}
                  className="w-full bg-transparent px-4 py-3 text-sm text-white resize-none focus:outline-none max-h-32"
                  style={{ minHeight: "44px" }}
                />
              </div>
              <button
                onClick={sendMessage}
                disabled={isStreaming || !input.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white p-3 rounded-xl transition-colors"
              >
                <Send size={16} />
              </button>
              <button
                onClick={clearHistory}
                className="bg-gray-800 hover:bg-gray-700 text-gray-400 p-3 rounded-xl transition-colors"
                title="清除對話"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* ── 側邊欄：專案記憶面板 ── */}
        <div className="w-64 shrink-0 border-l border-gray-800 flex flex-col bg-gray-900/50">
          <button
            onClick={() => setMemoryOpen((v) => !v)}
            className="flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-300 hover:text-white transition-colors border-b border-gray-800"
          >
            <span className="flex items-center gap-2">
              <Brain size={15} className="text-purple-400" />
              專案記憶
              {memories.length > 0 && (
                <span className="bg-purple-800/60 text-purple-300 text-xs px-1.5 py-0.5 rounded-full">
                  {memories.length}
                </span>
              )}
            </span>
            {memoryOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>

          {memoryOpen && (
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {memories.length === 0 ? (
                <p className="text-xs text-gray-600 text-center py-6">
                  還沒有記憶
                  <br />
                  <span className="text-gray-700">對話時 AI 可以自動記住重要資訊</span>
                </p>
              ) : (
                memories.map((m) => (
                  <div
                    key={m.id}
                    className="bg-gray-800 rounded-lg p-2.5 group relative"
                  >
                    <p className="text-xs text-purple-400 font-medium mb-0.5 truncate">{m.key}</p>
                    <p className="text-xs text-gray-300 leading-relaxed line-clamp-3">{m.value}</p>
                    <button
                      onClick={() => deleteMemory(m.key)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 text-gray-600 hover:text-red-400 transition-all text-xs"
                      title="刪除此記憶"
                    >
                      ✕
                    </button>
                  </div>
                ))
              )}
            </div>
          )}

          {!memoryOpen && memories.length > 0 && (
            <div className="p-3">
              <p className="text-xs text-gray-600">
                {memories.length} 則記憶已儲存
              </p>
            </div>
          )}
        </div>
      </div>
    </ProjectLayout>
  );
}
