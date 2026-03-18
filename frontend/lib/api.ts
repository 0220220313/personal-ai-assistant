const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── 通用 fetch ──────────────────────────────────────────
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || `HTTP ${res.status}`);
  }
  return res.json();
}

// ── 專案 ──────────────────────────────────────────────
export const projectsApi = {
  list:   (archived = false) => api<Project[]>(`/api/projects/?archived=${archived}`),
  get:    (id: string)       => api<Project>(`/api/projects/${id}`),
  create: (data: Partial<Project>) => api<Project>("/api/projects/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Project>) => api(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => api(`/api/projects/${id}`, { method: "DELETE" }),
};

// ── 對話 ──────────────────────────────────────────────
export const chatApi = {
  getHistory: (projectId: string) => api<Message[]>(`/api/chat/${projectId}/history`),
  clearHistory: (projectId: string) => api(`/api/chat/${projectId}/history`, { method: "DELETE" }),
  extractTasks: (messageId: string) => api<{ tasks: Task[] }>(`/api/chat/${messageId}/extract-tasks`, { method: "POST" }),
};

// 串流對話（回傳 Response 原始物件）
export async function streamChat(projectId: string, message: string, fileIds: string[] = []) {
  return fetch(`${BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, message, file_ids: fileIds }),
  });
}

// ── 檔案 ──────────────────────────────────────────────
export const filesApi = {
  list:   (projectId: string) => api<File[]>(`/api/files/${projectId}`),
  upload: async (projectId: string, file: globalThis.File) => {
    const form = new FormData();
    form.append("file", file);
    const res = await fetch(`${BASE}/api/files/upload/${projectId}`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json();
  },
  delete: (fileId: string) => api(`/api/files/${fileId}`, { method: "DELETE" }),
};

// ── 任務 ──────────────────────────────────────────────
export const tasksApi = {
  list:       (projectId: string) => api<Task[]>(`/api/tasks/${projectId}`),
  create:     (projectId: string, data: Partial<Task>) => api<Task>(`/api/tasks/${projectId}`, { method: "POST", body: JSON.stringify(data) }),
  update:     (taskId: string, data: Partial<Task>) => api(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete:     (taskId: string) => api(`/api/tasks/${taskId}`, { method: "DELETE" }),
  aiGenerate: (projectId: string, text: string) => api(`/api/tasks/${projectId}/ai-generate`, { method: "POST", body: JSON.stringify({ text }) }),
};

// ── 報告 ──────────────────────────────────────────────
export const reportsApi = {
  list:     (projectId: string) => api<Report[]>(`/api/reports/${projectId}`),
  generate: (projectId: string, report_type: string, extra_context = "") =>
    api<Report>(`/api/reports/${projectId}/generate`, { method: "POST", body: JSON.stringify({ report_type, extra_context }) }),
  delete:   (reportId: string) => api(`/api/reports/${reportId}`, { method: "DELETE" }),
};

// ── 專案記憶 ───────────────────────────────────────────
export const memoryApi = {
  list:   (projectId: string) => api<ProjectMemory[]>(`/api/projects/${projectId}/memory`),
  upsert: (projectId: string, key: string, value: string) =>
    api(`/api/projects/${projectId}/memory`, { method: "POST", body: JSON.stringify({ key, value }) }),
  delete: (projectId: string, key: string) => api(`/api/projects/${projectId}/memory/${encodeURIComponent(key)}`, { method: "DELETE" }),
  clear:  (projectId: string) => api(`/api/projects/${projectId}/memory`, { method: "DELETE" }),
};

// ── Agent 指令 ─────────────────────────────────────────
export const agentApi = {
  sendCommand: (command: string) => api<AgentCommandResult>("/api/agent/command", { method: "POST", body: JSON.stringify({ command }) }),
  listCommands: () => api<AgentCommand[]>("/api/agent/commands"),
  status: () => api<{ online: boolean }>("/api/agent/status"),
};

// ── Types ─────────────────────────────────────────────
export interface Project {
  id: string; name: string; description: string;
  tags: string[]; color: string; is_archived: boolean;
  tasks_count?: number; files_count?: number;
  created_at: string; updated_at: string;
}
export interface Message {
  id: string; role: "user" | "assistant" | "system";
  content: string; file_refs: string[]; created_at: string;
}
export interface File {
  id: string; original_name: string; file_type: string;
  file_size: number; summary: string; is_indexed: boolean; created_at: string;
}
export interface Task {
  id: string; title: string; description: string;
  status: "todo" | "in_progress" | "done" | "archived";
  priority: "high" | "medium" | "low";
  assignee: string; due_date: string;
  source_msg: string; created_at: string; updated_at: string;
}
export interface Report {
  id: string; title: string; report_type: string;
  content: string; created_at: string;
}
export interface AgentCommand {
  id: string; command: string; status: string;
  result: string; created_at: string; updated_at: string;
}
export interface AgentCommandResult extends AgentCommand {
  agent_online: boolean;
}
export interface ProjectMemory {
  id: string; key: string; value: string;
  created_at: string; updated_at: string;
}
export interface SSETextEvent { type: "text"; content: string; }
export interface SSEActionEvent {
  type: "action";
  action: "task_created" | "command_sent" | "memory_saved";
  data: Record<string, unknown>;
}
export interface SSEDoneEvent { type: "done"; message_id: string; }
export type SSEEvent = SSETextEvent | SSEActionEvent | SSEDoneEvent;
