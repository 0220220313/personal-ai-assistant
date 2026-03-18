"use client";
import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { useDropzone } from "react-dropzone";
import { Upload, Trash2, FileText, CheckCircle, Clock, ChevronDown, ChevronUp } from "lucide-react";
import { filesApi, type File } from "@/lib/api";
import ProjectLayout from "@/components/layout/ProjectLayout";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function KnowledgePage() {
  const { id } = useParams<{ id: string }>();
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    loadFiles();
    // 輪詢：確認背景處理進度
    const timer = setInterval(loadFiles, 5000);
    return () => clearInterval(timer);
  }, [id]);

  async function loadFiles() {
    const data = await filesApi.list(id);
    setFiles(data);
  }

  const onDrop = useCallback(async (accepted: globalThis.File[]) => {
    setUploading(true);
    for (const file of accepted) {
      try {
        await filesApi.upload(id, file);
      } catch (e: any) {
        alert(`上傳 ${file.name} 失敗: ${e.message}`);
      }
    }
    setUploading(false);
    loadFiles();
  }, [id]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "text/plain": [".txt"],
      "image/*": [".jpg", ".jpeg", ".png", ".webp"],
    },
    multiple: true,
  });

  async function deleteFile(fileId: string) {
    if (!confirm("確定要刪除這個檔案？")) return;
    await filesApi.delete(fileId);
    setFiles(prev => prev.filter(f => f.id !== fileId));
  }

  const fileIcon = (type: string) => ({ pdf: "📄", docx: "📝", xlsx: "📊", image: "🖼️", txt: "📃" }[type] || "📎");
  const fileSize = (b: number) => b > 1048576 ? `${(b/1048576).toFixed(1)}MB` : `${(b/1024).toFixed(0)}KB`;

  return (
    <ProjectLayout projectId={id} activeTab="knowledge">
      <div className="h-full overflow-y-auto p-4">
        {/* 上傳區 */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-8 text-center mb-6 cursor-pointer transition-all ${
            isDragActive ? "border-indigo-500 bg-indigo-950/30" : "border-gray-700 hover:border-gray-500"
          } ${uploading ? "opacity-50 pointer-events-none" : ""}`}
        >
          <input {...getInputProps()} />
          <Upload size={32} className="mx-auto mb-3 text-gray-500" />
          <p className="text-gray-300 font-medium">
            {uploading ? "上傳中..." : isDragActive ? "放開以上傳" : "拖拉檔案或點擊上傳"}
          </p>
          <p className="text-gray-500 text-sm mt-1">支援 PDF、Word、Excel、圖片、TXT</p>
        </div>

        {/* 檔案列表 */}
        {files.length === 0 ? (
          <div className="text-center text-gray-500 py-12">
            <FileText size={40} className="mx-auto mb-3 opacity-30" />
            <p>尚無文件，上傳後 AI 將自動分析</p>
          </div>
        ) : (
          <div className="space-y-3">
            {files.map(f => (
              <div key={f.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                <div className="flex items-center gap-3 p-4">
                  <span className="text-2xl">{fileIcon(f.file_type)}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{f.original_name}</p>
                    <p className="text-gray-500 text-xs">{fileSize(f.file_size)}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {f.is_indexed
                      ? <span className="flex items-center gap-1 text-green-400 text-xs"><CheckCircle size={12} /> 已分析</span>
                      : <span className="flex items-center gap-1 text-yellow-400 text-xs"><Clock size={12} /> 分析中</span>
                    }
                    {f.summary && (
                      <button onClick={() => setExpandedId(expandedId === f.id ? null : f.id)}
                        className="text-gray-400 hover:text-white p-1 transition-colors">
                        {expandedId === f.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
                    <button onClick={() => deleteFile(f.id)} className="text-gray-500 hover:text-red-400 p-1 transition-colors">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
                {expandedId === f.id && f.summary && (
                  <div className="border-t border-gray-800 px-4 py-3 bg-gray-950">
                    <p className="text-xs text-gray-500 mb-2">AI 摘要：</p>
                    <div className="markdown-body text-xs">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{f.summary}</ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </ProjectLayout>
  );
}
