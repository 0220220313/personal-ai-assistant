"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import { useParams } from "next/navigation";
import { useDropzone } from "react-dropzone";
import {
  Upload, Trash2, CheckCircle, Clock, ChevronRight, ChevronDown,
  FolderOpen, Folder, Plus, X, File, Image, FileSpreadsheet,
  FileText, Home, Move,
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

function FileIcon({ type, size = 14 }: { type: string; size?: number }) {
  const cls = "shrink-0";
  if (type === "image") return <Image size={size} className={`${cls} text-purple-400`} />;
  if (type === "pdf") return <FileText size={size} className={`${cls} text-red-400`} />;
  if (type === "xlsx") return <FileSpreadsheet size={size} className={`${cls} text-green-400`} />;
  if (type === "pptx") return <FileText size={size} className={`${cls} text-orange-400`} />;
  if (type === "docx") return <FileText size={size} className={`${cls} text-blue-400`} />;
  return <File size={size} className={`${cls} text-gray-400`} />;
}

function folderDisplayName(path: string) {
  if (path === "/") return "全部檔案";
  return path.split("/").filter(Boolean).pop() || path;
}

interface TreeNode {
  type: "folder" | "file";
  path: string;
  name: string;
  file?: FileItem;
  children: TreeNode[];
}

function buildTree(allFiles: FileItem[], virtualFolders: string[]): TreeNode {
  const root: TreeNode = { type: "folder", path: "/", name: "全部檔案", children: [] };
  const nodeMap: Record<string, TreeNode> = { "/": root };

  // Collect all folder paths
  const allPaths = new Set<string>(["/"]);
  [...virtualFolders, ...allFiles.map(f => f.folder_path || "/")].forEach(fp => {
    if (!fp || fp === "/") return;
    const parts = fp.split("/").filter(Boolean);
    for (let i = 1; i <= parts.length; i++) {
      allPaths.add("/" + parts.slice(0, i).join("/"));
    }
  });

  // Create folder nodes
  Array.from(allPaths).sort().forEach(fp => {
    if (fp === "/") return;
    const parts = fp.split("/").filter(Boolean);
    const parent = parts.length === 1 ? "/" : "/" + parts.slice(0, -1).join("/");
    const node: TreeNode = { type: "folder", path: fp, name: parts[parts.length - 1], children: [] };
    nodeMap[fp] = node;
    if (nodeMap[parent]) nodeMap[parent].children.push(node);
  });

  // Add files
  allFiles.forEach(f => {
    const fp = f.folder_path || "/";
    const parent = nodeMap[fp];
    if (parent) {
      parent.children.push({ type: "file", path: f.id, name: f.original_name, file: f, children: [] });
    }
  });

  return root;
}

function TreeView({
  node, currentFolder, selectedId, onFolder, onFile, depth = 0,
}: {
  node: TreeNode; currentFolder: string; selectedId: string | null;
  onFolder: (p: string) => void; onFile: (f: FileItem) => void; depth?: number;
}) {
  const [open, setOpen] = useState(true);
  const isActiveFolder = node.type === "folder" && node.path === currentFolder;
  const isSelectedFile = node.type === "file" && node.path === selectedId;

  if (node.type === "file" && node.file) {
    const f = node.file;
    return (
      <button
        onClick={() => onFile(f)}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        className={`w-full flex items-center gap-1.5 py-1 px-2 rounded-lg text-xs transition-colors text-left truncate ${
          isSelectedFile ? "bg-indigo-600/20 text-indigo-300" : "text-gray-500 hover:text-gray-300 hover:bg-gray-800/50"
        }`}
      >
        <span className="w-3 shrink-0" />
        <FileIcon type={f.file_type} size={12} />
        <span className="truncate flex-1">{f.original_name}</span>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${f.is_indexed ? "bg-green-500" : "bg-yellow-500 animate-pulse"}`} />
      </button>
    );
  }

  const hasFolderKids = node.children.some(c => c.type === "folder");
  const fileCount = node.children.filter(c => c.type === "file").length;

  return (
    <div>
      <button
        onClick={() => { onFolder(node.path); if (node.children.length) setOpen(o => !o); }}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        className={`w-full flex items-center gap-1.5 py-1.5 px-2 rounded-lg text-sm transition-colors text-left ${
          isActiveFolder ? "bg-indigo-600/20 text-indigo-300 font-medium" : "text-gray-400 hover:text-white hover:bg-gray-800"
        }`}
      >
        {node.children.length ? (
          open ? <ChevronDown size={11} className="shrink-0 text-gray-500" /> : <ChevronRight size={11} className="shrink-0 text-gray-500" />
        ) : <span className="w-3 shrink-0" />}
        {isActiveFolder ? <FolderOpen size={13} className="shrink-0 text-indigo-400" /> : <Folder size={13} className="shrink-0" />}
        <span className="truncate flex-1">{node.name}</span>
        {fileCount > 0 && <span className="text-xs text-gray-600 shrink-0">{fileCount}</span>}
      </button>
      {open && node.children.map(c => (
        <TreeView key={c.path} node={c} currentFolder={currentFolder} selectedId={selectedId} onFolder={onFolder} onFile={onFile} depth={depth + 1} />
      ))}
    </div>
  );
}

export default function KnowledgePage() {
  const { id } = useParams<{ id: string }>();
  const [allFiles, setAllFiles] = useState<FileItem[]>([]);
  const [virtualFolders, setVirtualFolders] = useState<string[]>(["/"]);
  const [currentFolder, setCurrentFolder] = useState("/");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    loadAll();
    pollRef.current = setInterval(loadAll, 5000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [id]);

  async function loadAll() {
    try {
      const [files, { folders }] = await Promise.all([filesApi.list(id), filesApi.getFolders(id)]);
      setAllFiles(files);
      setVirtualFolders(prev => Array.from(new Set([...folders, ...prev])));
    } catch {}
  }

  const currentFiles = allFiles.filter(f => (f.folder_path || "/") === currentFolder);
  const allFolderPaths = Array.from(new Set([...virtualFolders, ...allFiles.map(f => f.folder_path || "/")]));
  const treeRoot = buildTree(allFiles, virtualFolders);

  const onDrop = useCallback(async (accepted: globalThis.File[]) => {
    if (!accepted.length) return;
    setUploading(true); setProgress([]);
    for (const file of accepted) {
      setProgress(p => [...p, `⏳ ${file.name}`]);
      try {
        await filesApi.upload(id, file, currentFolder);
        setProgress(p => p.map(x => x.includes(file.name) && x.startsWith("⏳") ? `✅ ${file.name}` : x));
      } catch {
        setProgress(p => p.map(x => x.includes(file.name) && x.startsWith("⏳") ? `❌ ${file.name}` : x));
      }
    }
    await loadAll(); setUploading(false);
    setTimeout(() => setProgress([]), 4000);
  }, [id, currentFolder]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop, multiple: true,
    accept: {
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
      "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
      "application/vnd.ms-powerpoint": [".ppt"],
      "text/plain": [".txt"],
      "text/markdown": [".md"],
      "image/*": [".jpg", ".jpeg", ".png", ".webp"],
    },
  });

  async function deleteFile(fileId: string) {
    if (!confirm("確定刪除？")) return;
    await filesApi.delete(fileId);
    setAllFiles(f => f.filter(x => x.id !== fileId));
    if (selectedId === fileId) setSelectedId(null);
  }

  async function moveFile(file: FileItem, fp: string) {
    await filesApi.moveFile(file.id, fp);
    await loadAll(); setMovingId(null);
  }

  function createFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    const newPath = currentFolder === "/" ? `/${name}` : `${currentFolder}/${name}`;
    setVirtualFolders(f => Array.from(new Set([...f, newPath])));
    setCurrentFolder(newPath);
    setNewFolderName(""); setShowNewFolder(false);
  }

  const breadcrumbs = currentFolder === "/"
    ? [{ label: "全部", path: "/" }]
    : [{ label: "全部", path: "/" }, ...currentFolder.split("/").filter(Boolean).map((p, i, a) => ({ label: p, path: "/" + a.slice(0, i + 1).join("/") }))];

  return (
    <ProjectLayout projectId={id} activeTab="knowledge">
      <div className="flex h-full overflow-hidden">
        {/* Sidebar */}
        <div className="w-56 shrink-0 border-r border-gray-800 bg-gray-900/40 flex flex-col">
          <div className="px-3 py-2.5 border-b border-gray-800 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">檔案總管</span>
            <button onClick={() => setShowNewFolder(true)} className="p-1 hover:bg-gray-700 rounded text-gray-500 hover:text-white transition-colors" title="新增資料夾">
              <Plus size={13} />
            </button>
          </div>

          {showNewFolder && (
            <div className="p-2 border-b border-gray-800 bg-gray-900">
              <p className="text-xs text-gray-500 mb-1.5">在「{folderDisplayName(currentFolder)}」中新增</p>
              <div className="flex gap-1">
                <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") createFolder(); if (e.key === "Escape") setShowNewFolder(false); }}
                  placeholder="資料夾名稱" className="flex-1 bg-gray-800 border border-indigo-500 rounded px-2 py-1 text-xs text-white focus:outline-none min-w-0" />
                <button onClick={createFolder} className="p-1 bg-indigo-600 rounded text-white hover:bg-indigo-700"><Plus size={11} /></button>
                <button onClick={() => setShowNewFolder(false)} className="p-1 text-gray-500 hover:text-white"><X size={11} /></button>
              </div>
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-1.5">
            <TreeView node={treeRoot} currentFolder={currentFolder} selectedId={selectedId} onFolder={setCurrentFolder}
              onFile={f => { setSelectedId(f.id); setExpandedId(f.id); setCurrentFolder(f.folder_path || "/"); }} />
          </div>

          <div className="p-2 border-t border-gray-800">
            <label className="flex items-center justify-center gap-1.5 w-full py-2 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-700/40 rounded-lg text-xs text-indigo-300 cursor-pointer transition-colors">
              <Upload size={12} /> 上傳到此資料夾
              <input type="file" className="hidden" multiple accept=".pdf,.docx,.xlsx,.pptx,.ppt,.txt,.md,.jpg,.jpeg,.png,.webp"
                onChange={async e => { if (e.target.files) { await onDrop(Array.from(e.target.files)); e.target.value = ""; } }} />
            </label>
          </div>
        </div>

        {/* Main panel */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar / breadcrumb */}
          <div className="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2 bg-gray-900/20">
            <div className="flex items-center gap-1 text-sm flex-1 min-w-0">
              {breadcrumbs.map((c, i) => (
                <span key={c.path} className="flex items-center gap-1">
                  {i > 0 && <ChevronRight size={11} className="text-gray-700" />}
                  <button onClick={() => setCurrentFolder(c.path)}
                    className={`transition-colors ${i === breadcrumbs.length - 1 ? "text-white font-medium" : "text-gray-500 hover:text-white"}`}>
                    {i === 0 ? <Home size={13} /> : c.label}
                  </button>
                </span>
              ))}
            </div>
            <span className="text-xs text-gray-600">{currentFiles.length} 個檔案</span>
          </div>

          {progress.length > 0 && (
            <div className="mx-4 mt-3 bg-gray-800/80 border border-gray-700 rounded-xl p-3 space-y-1">
              {progress.map((msg, i) => <p key={i} className="text-xs text-gray-300">{msg}</p>)}
            </div>
          )}

          <div className="flex-1 overflow-y-auto p-4">
            <div {...getRootProps()} onClick={e => e.stopPropagation()}
              className={`min-h-full rounded-xl border-2 border-dashed transition-all ${isDragActive ? "border-indigo-500 bg-indigo-900/10" : "border-transparent"}`}>
              <input {...getInputProps()} />

              {currentFiles.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center cursor-pointer"
                  onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true; inp.accept = ".pdf,.docx,.xlsx,.pptx,.ppt,.txt,.md,.jpg,.jpeg,.png,.webp"; inp.onchange = async e => { const f = (e.target as HTMLInputElement).files; if (f) await onDrop(Array.from(f)); }; inp.click(); }}>
                  <div className="w-14 h-14 bg-gray-800 hover:bg-gray-700 rounded-2xl flex items-center justify-center mb-3 transition-colors">
                    <Upload size={24} className="text-gray-500" />
                  </div>
                  <p className="text-gray-400 font-medium text-sm">{isDragActive ? "放開以上傳" : "拖曳或點擊上傳"}</p>
                  <p className="text-gray-600 text-xs mt-1">PDF · Word · Excel · PowerPoint · TXT · MD · 圖片</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {currentFiles.map(file => (
                    <div key={file.id} className={`border rounded-xl overflow-hidden transition-all group ${selectedId === file.id ? "border-indigo-600/50 bg-indigo-900/10" : "border-gray-800 bg-gray-900 hover:border-gray-700"}`}>
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center shrink-0">
                          <FileIcon type={file.file_type} size={16} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm text-white font-medium truncate">{file.original_name}</p>
                            {file.is_indexed
                              ? <span className="flex items-center gap-1 text-xs text-green-400 bg-green-900/20 px-2 py-0.5 rounded-full shrink-0"><CheckCircle size={10} /> 已索引</span>
                              : <span className="flex items-center gap-1 text-xs text-yellow-400 bg-yellow-900/20 px-2 py-0.5 rounded-full shrink-0"><Clock size={10} className="animate-spin" /> 處理中</span>}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{formatBytes(file.file_size)} · {new Date(file.created_at).toLocaleDateString("zh-TW")}</p>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {file.summary && (
                            <button onClick={() => { setExpandedId(expandedId === file.id ? null : file.id); setSelectedId(file.id); }}
                              className="px-2 py-1.5 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors text-xs">
                              {expandedId === file.id ? "收合" : "摘要"}
                            </button>
                          )}
                          <button onClick={() => setMovingId(movingId === file.id ? null : file.id)} className="p-1.5 hover:bg-gray-700 rounded-lg text-gray-400 hover:text-white transition-colors" title="移動">
                            <Move size={14} />
                          </button>
                          <button onClick={() => deleteFile(file.id)} className="p-1.5 hover:bg-red-900/30 rounded-lg text-gray-500 hover:text-red-400 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {movingId === file.id && (
                        <div className="px-4 pb-3 border-t border-gray-800 pt-2.5">
                          <p className="text-xs text-gray-500 mb-2">移動到：</p>
                          <div className="flex flex-wrap gap-1.5">
                            {allFolderPaths.map(fp => (
                              <button key={fp} onClick={() => moveFile(file, fp)} disabled={fp === file.folder_path}
                                className={`text-xs px-3 py-1 rounded-full border transition-colors ${fp === file.folder_path ? "border-indigo-500/50 text-indigo-400/50 cursor-default" : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-white"}`}>
                                {fp === "/" ? "根目錄" : folderDisplayName(fp)}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {expandedId === file.id && file.summary && (
                        <div className="px-4 pb-4 border-t border-gray-800 pt-3">
                          <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">AI 摘要</p>
                          <div className="text-sm text-gray-300 markdown-body">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{file.summary}</ReactMarkdown>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="py-5 text-center border border-dashed border-gray-800 hover:border-gray-600 rounded-xl transition-colors cursor-pointer"
                    onClick={() => { const inp = document.createElement("input"); inp.type = "file"; inp.multiple = true; inp.accept = ".pdf,.docx,.xlsx,.pptx,.ppt,.txt,.md,.jpg,.jpeg,.png,.webp"; inp.onchange = async e => { const f = (e.target as HTMLInputElement).files; if (f) await onDrop(Array.from(f)); }; inp.click(); }}>
                    <p className="text-xs text-gray-600">+ 拖曳更多檔案，或點擊選擇</p>
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
