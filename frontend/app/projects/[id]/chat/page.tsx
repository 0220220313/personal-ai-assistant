"use client";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Send, Paperclip, Trash2, Sparkles } from "lucide-react";
import { chatApi, filesApi, streamChat, type Message, type File } from "@/lib/api";
import ProjectLayout from "@/components/layout/ProjectLayout";

export default function ChatPage() {
  const { id } = useParams<{ id: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [streamingText, setStreamingText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadData();
  }, [id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingText]);

  async function loadData() {
    const [msgs, fls] = await Promise.all([
      chatApi.getHistory(id),
      filesApi.list(id)
    ]);
    setMessages(msgs);
    setFiles(fls.filter(f => f.is_indexed));
  }

  async function sendMessage() {
    if (!input.trim() || isStreaming) return;
    const text = input.trim();
    setInput("");
    setIsStreaming(true);
    setStreamingText("");

    // 即時顯示用戶訊息
    const tempUserMsg: Message = {
      id: "temp-user", role: "user", content: text,
      file_refs: selectedFiles, created_at: new Date().toISOString()
    };
    setMessages(prev => [...prev, tempUserMsg]);

    try {
      const res = await streamChat(id, text, selectedFiles);
      if (!res.body) return;

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n").filter(l => l.startsWith("data: "));
        for (const line of lines) {
          try {
            const data = JSON.parse(line.replace("data: ", ""));
            if (data.text) {
              accumulated += data.text;
              setStreamingText(accumulated);
            }
            if (data.done) {
              // 串流完成，重新載入歷史
              await loadData();
              setStreamingText("");
            }
          } catch {}
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

  return (
    <ProjectLayout projectId={id} activeTab="chat">
      <div className="flex flex-col h-full">
        {/* 訊息區域 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.length === 0 && !streamingText && (
            <div className="text-center text-gray-500 mt-20">
              <Sparkles size={40} className="mx-auto mb-3 opacity-30" />
              <p>開始與 AI 助理對話吧！</p>
              <p className="text-xs mt-2 text-gray-600">可以上傳文件、詢問問題、請求生成報告</p>
            </div>
          )}

          {messages.map(msg => (
            <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
              {msg.role === "assistant" && (
                <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs mr-2 mt-1 shrink-0">AI</div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                msg.role === "user"
                  ? "bg-indigo-600 text-white rounded-br-sm"
                  : "bg-gray-800 text-gray-100 rounded-bl-sm"
              }`}>
                {msg.role === "user" ? (
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                ) : (
                  <div className="markdown-body text-sm">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                  </div>
                )}
              </div>
            </div>
          ))}

          {/* 串流中的回覆 */}
          {streamingText && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs mr-2 mt-1 shrink-0">AI</div>
              <div className="max-w-[80%] bg-gray-800 text-gray-100 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="markdown-body text-sm">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{streamingText}</ReactMarkdown>
                </div>
                <div className="flex gap-1 mt-2">
                  {[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-indigo-400 typing-dot" style={{animationDelay:`${i*0.2}s`}} />)}
                </div>
              </div>
            </div>
          )}

          {isStreaming && !streamingText && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-xs mr-2 mt-1 shrink-0">AI</div>
              <div className="bg-gray-800 rounded-2xl rounded-bl-sm px-4 py-3">
                <div className="flex gap-1">
                  {[0,1,2].map(i => <div key={i} className="w-2 h-2 rounded-full bg-gray-500 typing-dot" />)}
                </div>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* 引用檔案 */}
        {files.length > 0 && (
          <div className="px-4 py-2 border-t border-gray-800">
            <p className="text-xs text-gray-500 mb-1.5">引用知識庫檔案：</p>
            <div className="flex flex-wrap gap-1.5">
              {files.map(f => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFiles(prev =>
                    prev.includes(f.id) ? prev.filter(x => x !== f.id) : [...prev, f.id]
                  )}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-all ${
                    selectedFiles.includes(f.id)
                      ? "bg-indigo-600 border-indigo-500 text-white"
                      : "bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500"
                  }`}
                >
                  📄 {f.original_name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 輸入區 */}
        <div className="p-4 border-t border-gray-800">
          <div className="flex items-end gap-2">
            <div className="flex-1 bg-gray-800 border border-gray-700 rounded-xl overflow-hidden focus-within:border-indigo-500 transition-colors">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => {
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
    </ProjectLayout>
  );
}
