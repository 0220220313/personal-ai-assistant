"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useDropzone } from "react-dropzone";
import {
  Upload, Trash2, FileText, CheckCircle, Clock, ChevronRight,
  FolderOpen, Folder, Plus, X, File, Image, FileSpreadsheet,
  ChevronDown, Move, Home,
} from "lucide-react";
import { filesApi, type FileItem } from "@/lib/api";
import ProjectLayout from "@/components/layout/ProjectLayout";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(type: string) {
  if (type === "image") return <Image size={16} className="text-purple-400" />;
  if (type === "pdf") return <FileText size={16} className="text-red-400" />;
  if (type === "xlsx") return <FileSpreadsheet size={16} className="text-green-400" />;
  return <File size={16} className="text-blue-400" />;
}

// Parse folder tree from list of paths
function buildTree(paths: string[]): Record<string, string[]> {
  const tree: Record<string, string[]> = { "/": [] };
  for (const p of paths) {
    if (p === "/") continue;
    const parts = p.split("/").filter(Boolean);
    for (let i = 0; i < parts.length; i++) {
      const parent = i === 0 ? "/" : "/" + parts.slice(0, i).join("/");
      const child = "/" + parts.slice(0, i + 1).join("/");
      if (!tree[parent]) tree[parent] = [];
      if (!tree[parent].includes(child)) tree[parent].push(child);
      if (!tree[child]) tree[child] = [];
    }
  }
  return tree;
}

function folderName(path: string) {
  if (path === "/") return "全部檔案";
  return path.split("/").filter(Boolean).pop() || path;
}

interface FolderNodeProps {
  path: string;
  tree: Record<string, string[]>;
  current: string;
  onSelect: (p: string) => void;
  depth?: number;
}

function FolderNode({ path, tree, current, onSelect, depth = 0 }: FolderNodeProps) {
  const [open, setOpen] = useState(true);
  const children = tree[path] || [];
  const isActive = current === path;

  return (
    <div>
      <button
        onClick={() => { onSelect(path); if (children.length) setOpen(o => !o); }}
        className={`w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-sm transition-colors text-left
          ${isActive ? "bg-indigo-600/20 text-indigo-300" : "text-gray-400 hover:text-white hover:bg-gray-800"}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {children.length > 0 ? (
          open ? <ChevronDown size={12} className="shrink-0" /> : <ChevronRight size={12} className="shrink-0" />
        ) : <span className="w-3" />}
        {isActive ? <FolderOpen size={14} className="shrink-0 text-indigo-400" /> : <Folder size={14} className="shrink-0" />}
        <span className="truncate">{folderName(path)}</span>
      </button>
      {open && children.map(child => (
        <FolderNode key={child} path={child} tree={tree} current={current} onSelect={onSelect} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function KnowledgePage() {
  const { id } = useParams<{ id: string }>();
  const [files, setFiles] = useState<FileItem[]>([]);
  const [folders, setFolders] = useState<string[]>([]);
  const [currentFolder, setCurrentFolder] = useState("/");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [movingFile, setMovingFile] = useState<FileItem | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadAll();
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = setInterval(loadFiles, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [id, currentFolder]);

  async function loadAll() {
    await Promise.all([loadFiles(), loadFolders()]);
  }

  async function loadFiles() {
    try {
      const data = await filesApi.list(id, currentFolder);
      setFiles(data);
    } catch {}
  }

  async function loadFolders() {
    try {
      const data = await filesApi.getFolders(id);
      setFolders(data.folders);
    } catch {
      setFolders(["/"]);
    }
  }

  const onDrop = useCallback(async (accepted: globalThis.File[]) => {
    if (!accepted.length) return;
    setUploading(true);
    setUploadProgress([]);
    for (const file of accepted) {
      setUploadProgress(p => [...p, `上傳中: ${file.name}`]);
      try {
        await filesApi.upload(id, file, currentFolder);
        setUploadProgress(p => p.map(x => x === `上傳中: ${file.name}` ? `✅ ${file.name}` : x));
      } catch {
        setUploadProgress(p => p.map(x => x === `上傳中: ${file.name}` ? `❌ ${file.name} 失敗` : x));
      }
    }
    await loadAll();
    setUploading(false);
    setTimeout(() => setUploadProgress([]), 3000);
  }, [id, currentFolder]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "text/plain": [".txt"],
      "text/markdown": [".md"],
      "image/*": [".jpg", ".jpeg", ".png", ".webp"],
    },
    multiple: true,
    noClick: false,
  });

  async function deleteFile(fileId: string) {
    if (!confirm("確定刪除此檔案？")) return;
    await filesApi.delete(fileId);
    setFiles(f => f.filter(x => x.id !== fileId));
    await loadFolders();
  }

  async function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const newPath = currentFolder === "/" ? `/${name}` : `${currentFolder}/${name}`;
    if (!folders.includes(newPath)) {
      setFolders(f => [...f, newPath]);
    }
    setCurrentFolder(newPath);
    setNewFolderName("");
    setShowNewFolder(false);
  }

  async function moveFile(file: FileItem, targetFolder: string) {
    try {
      await filesApi.moveFile(file.id, targetFolder);
      await loadAll();
    } catch {}
    setMovingFile(null);
  }

  const tree = buildTree(folders.length ? folders : ["/"]);

  // Breadcrumbs
  const breadcrumbs = currentFolder === "/"
    ? [{ label: "全部", path: "/" }]
    : [
        { label: "全部", path: "/" },
        ...currentFolder.split("/").filter(Boolean).map((part, i, arr) => ({
          label: part,
          path: "/" + arr.slice(0, i + 1).join("/"),
        })),
      ];

  return (
    <ProjectLayout projectId={id} activeTab="knowledge">
      <div className="flex h-full overflow-hidden">
        {/* ── Sidebar: Folder Tree ── */}
        <div className="w-52 shrink-0 border-r border-gray-800 bg-gray-900/50 flex flex-col">
          <div className="p-3 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">資料夾</span>
            <button
              onClick={() => setShowNewFolder(true)}
              className="p-1 hover:bg-gray-700 rounded text-gray-500 hover:text-white transition-colors"
              title="新增資料夾"
            >
              <Plus size={14} />
            </button>
          </div>

          {showNewFolder && (
            <div className="p-2 border-b border-gray-800">
              <div className="flex gap-1">
                <input
                  autoFocus
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
                  placeholder="資料夾名稱"
                  className="flex-1 bg-gray-800 border border-indigo-500 rounded px-2 py-1 text-xs text-white focus:outline-none min-w-0"
                />
                <button onClick={createFolder} className="p-1 bg-indigo-600 rounded text-white hover:bg-indigo-700">
                  <Plus size={12} />
                </button>
                <button onClick={() => setShowNewFolder(false)} className="p-1 text-gray-500 hover:text-white">
                  <X size={12} />
                </button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            <FolderNode path="/" tree={tree} current={currentFolder} onSelect={setCurrentFolder} />
          </div>
        </div>

        {/* ── Main Content ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="px-4 py-3 border-b border-gray-800 flex items-center gap-2">
            {/* Breadcrumbs */}
            <div className="flex items-center gap-1 text-sm flex-1 min-w-0">
              {breadcrumbs.map((crumb, i) => (
                <span key={crumb.path} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={12} className="text-gray-600" />}
                  <button
                    onClick={() => setCurrentFolder(crumb.path)}
                    className={`hover:text-white transition-colors truncate ${
                      i === breadcrumbs.length - 1 ? "text-white font-medium" : "text-gray-500"
                    }`}
                  >
                    {i === 0 ? <Home size={14} /> : crumb.label}
                  </button>
                </span>
              ))}
            </div>

            <span className="text-xs text-gray-500">{files.length} 個檔案</span>
          </div>

          {/* Upload progress */}
          {uploadProgress.length > 0 && (
            <div className="mx-4 mt-3 bg-gray-800 border border-gray-700 rounded-lg p-3 space-y-1">
              {uploadProgress.map((msg, i) => (
                <p key={i} className="text-xs text-gray-300">{msg}</p>
              ))}
            </div>
          )}

          {/* File list + dropzone */}
          <div className="flex-1 overflow-y-auto p-4">
            <div
              {...getRootProps()}
              className={`min-h-full rounded-xl border-2 border-dashed transition-colors ${
                isDragActive
                  ? "border-indigo-500 bg-indigo-900/10"
                  : "border-transparent hover:border-gray-700"
              }`}
            >
              <input {...getInputProps()} />

              {files.length === 0 && !uploading ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                  <div className="w-16 h-16 bg-gray-800 rounded-2xl flex items-center justify-center mb-4">
                    <Upload size={28} className="text-gray-500" />
                  </div>
                  <p className="text-gray-400 font-medium mb-1">拖曳檔案到此處上傳</p>
                  <p className="text-gray-600 text-sm">支援 PDF、Word、Excel、TXT、Markdown、圖片</p>
                  <button
                    onClick={e => { e.stopPropagation(); }}
                    className="mt-4 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
                  >
                    選擇檔案
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {files.map(file => (
                    <div
                      key={file.id}
                      className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-xl overflow-hidden transition-colors group"
                    >
                      {/* File row */}
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
                          {fileIcon(file.file_type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm text-white font-medium truncate">{file.original_name}</p>
                            {file.is_indexed ? (
                              <span className="shrink-0 flex items-center gap-1 text-xs text-green-400 bg-green-900/20 px-2 py-0.5 rounded-full">
                                <CheckCircle size={10} /> 已索引
                              </span>
                            ) : (
                              <span className="shrink-0 flex items-center gap-1 text-xs text-yellow-400 bg-yellow-900/20 px-2 py-0.5 rounded-full">
                                <Clock size={10} className="animate-spin" /> 處理中
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {formatBytes(file.file_size)} · {new Date(file.created_at).toLocaleDateString("zh-TW")}
                          </p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() => setExpandedId(expandedId === file.id ? null : file.id)}
                            className="p-1.5 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors text-xs px-2"
                          >
                            {expandedId === file.id ? "收合" : "摘要"}
                          </button>
                          <button
                            onClick={() => setMovingFile(movingFile?.id === file.id ? null : file)}
                            className="p-1.5 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors"
                            title="移動到資料夾"
                          >
                            <Move size={14} />
                          </button>
                          <button
                            onClick={() => deleteFile(file.id)}
                            className="p-1.5 hover:bg-red-900/30 rounded-lg text-gray-500 hover:text-red-400 transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Move panel */}
                      {movingFile?.id === file.id && (
                        <div className="px-4 pb-3 border-t border-gray-800 pt-3">
                          <p className="text-xs text-gray-500 mb-2">移動到資料夾：</p>
                          <div className="flex flex-wrap gap-2">
                            {folders.map(f => (
                              <button
                                key={f}
                                onClick={() => moveFile(file, f)}
                                className={`text-xs px-3 py-1 rounded-full border transition-colors ${
                                  f === file.folder_path
                                    ? "border-indigo-500 text-indigo-300 bg-indigo-900/20"
                                    : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"
                                }`}
                              >
                                {f === "/" ? "根目錄" : folderName(f)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Summary expansion */}
                      {expandedId === file.id && file.summary && (
                        <div className="px-4 pb-4 border-t border-gray-800 pt-3">
                          <p className="text-xs text-gray-500 mb-2 uppercase tracking-wider font-medium">AI 摘要</p>
                          <div className="text-sm text-gray-300 markdown-body prose-sm">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{file.summary}</ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}

                  {/* Drop hint at bottom */}
                  <div className="py-6 text-center border-2 border-dashed border-gray-800 rounded-xl hover:border-gray-700 transition-colors cursor-pointer">
                    <p className="text-xs text-gray-600">拖曳更多檔案到此處，或點擊選擇</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProjectLayout>
  );
}
