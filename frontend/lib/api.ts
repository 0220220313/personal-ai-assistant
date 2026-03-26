const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { "Content-Type": "application/json", ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const projectsApi = {
  list:   (archived = false) => api<Project[]>(`/api/projects/?archived=${archived}`),
  get:    (id: string)       => api<Project>(`/api/projects/${id}`),
  create: (data: Partial<Project>) => api<Project>("/api/projects/", { method: "POST", body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Project>) => api<Project>(`/api/projects/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (id: string) => api(`/api/projects/${id}`, { method: "DELETE" }),
};

export const chatApi = {
  getHistory:   (projectId: string) => api<Message[]>(`/api/chat/${projectId}/history`),
  clearHistory: (projectId: string) => api(`/api/chat/${projectId}/history`, { method: "DELETE" }),
};

export async function streamChat(projectId: string, message: string, fileIds: string[] = []) {
  return fetch(`${BASE}/api/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, message, file_ids: fileIds }),
  });
}

export const filesApi = {
  list: (projectId: string, folder?: string) => {
    const params = folder !== undefined ? `?folder=${encodeURIComponent(folder)}` : "";
    return api<FileItem[]>(`/api/files/${projectId}${params}`);
  },
  getFolders: (projectId: string) => api<{ folders: string[] }>(`/api/files/${projectId}/folders`),
  upload: async (projectId: string, file: globalThis.File, folder = "/") => {
    const form = new FormData();
    form.append("file", file);
    form.append("folder", folder);
    const res = await fetch(`${BASE}/api/files/upload/${projectId}`, { method: "POST", body: form });
    if (!res.ok) throw new Error(await res.text());
    return res.json() as Promise<FileItem>;
  },
  moveFile: (fileId: string, folder: string) =>
    api(`/api/files/${fileId}/move`, { method: "PATCH", body: JSON.stringify({ folder }) }),
  delete: (fileId: string) => api(`/api/files/${fileId}`, { method: "DELETE" }),
  parsePptx: (fileId: string) =>
    api<PptxParseResult>(`/api/files/${fileId}/parse-pptx`, { method: "POST" }),
};

export const tasksApi = {
  list:       (projectId: string) => api<Task[]>(`/api/tasks/${projectId}`),
  create:     (projectId: string, data: Partial<Task>) => api<Task>(`/api/tasks/${projectId}`, { method: "POST", body: JSON.stringify(data) }),
  update:     (taskId: string, data: Partial<Task>) => api<Task>(`/api/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete:     (taskId: string) => api(`/api/tasks/${taskId}`, { method: "DELETE" }),
  aiGenerate: (projectId: string, text: string) => api(`/api/tasks/${projectId}/ai-generate`, { method: "POST", body: JSON.stringify({ text }) }),
};

export const reportsApi = {
  list:     (projectId: string) => api<Report[]>(`/api/reports/${projectId}`),
  generate: (projectId: string, report_type: string, extra_context = "") =>
    api<Report>(`/api/reports/${projectId}/generate`, { method: "POST", body: JSON.stringify({ report_type, extra_context }) }),
  delete:   (reportId: string) => api(`/api/reports/${reportId}`, { method: "DELETE" }),
};

export const memoryApi = {
  list:   (projectId: string) => api<ProjectMemory[]>(`/api/projects/${projectId}/memory`),
  upsert: (projectId: string, key: string, value: string) =>
    api(`/api/projects/${projectId}/memory`, { method: "POST", body: JSON.stringify({ key, value }) }),
  delete: (projectId: string, key: string) => api(`/api/projects/${projectId}/memory/${encodeURIComponent(key)}`, { method: "DELETE" }),
  clear:  (projectId: string) => api(`/api/projects/${projectId}/memory`, { method: "DELETE" }),
};

export const agentApi = {
  sendCommand:  (command: string) => api<AgentCommandResult>("/api/agent/command", { method: "POST", body: JSON.stringify({ command }) }),
  listCommands: () => api<AgentCommand[]>("/api/agent/commands"),
  status:       () => api<{ online: boolean }>("/api/agent/status"),
};

export const slidesApi = {
  generate: (projectId: string, data: { topic: string; num_slides?: number; template?: string; extra_context?: string; file_ids?: string[]; slide_types?: string[] }) =>
    api<Presentation>(`/api/slides/${projectId}/generate`, { method: "POST", body: JSON.stringify(data) }),
  list: (projectId: string) => api<PresentationSummary[]>(`/api/slides/${projectId}`),
  get:  (projectId: string, presId: string) => api<Presentation>(`/api/slides/${projectId}/${presId}`),
  update: (projectId: string, presId: string, data: Partial<Presentation>) =>
    api<Presentation>(`/api/slides/${projectId}/${presId}`, { method: "PATCH", body: JSON.stringify(data) }),
  delete: (projectId: string, presId: string) => api(`/api/slides/${projectId}/${presId}`, { method: "DELETE" }),
  download: async (projectId: string, presId: string, title: string) => {
    const res = await fetch(`${BASE}/api/slides/${projectId}/${presId}/download`);
    if (!res.ok) throw new Error(await res.text());
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = `${title}.pptx`; a.click();
    URL.revokeObjectURL(url);
  },
};

// ── Types ─────────────────────────────────────────────

export interface Project {
  id: string; name: string; description: string;
  tags: string[]; color: string; is_archived: boolean;
  tasks_count?: number; files_count?: number; overdue_count?: number;
  created_at: string; updated_at: string;
}

export interface Message {
  id: string; role: "user" | "assistant" | "system";
  content: string; file_refs: string[]; created_at: string;
}

export interface FileItem {
  id: string; original_name: string; file_type: string;
  file_size: number; summary: string; is_indexed: boolean;
  folder_path: string; created_at: string;
}
export type File = FileItem;

export interface PptxParseResult {
  slide_count: number;
  text_summary: string;
  image_count: number;
}

export interface Task {
  id: string; title: string; description: string;
  status: "todo" | "in_progress" | "done" | "archived";
  priority: "high" | "medium" | "low";
  assignee: string; due_date: string;
  source_msg: string; created_at: string; updated_at: string;
  is_milestone?: boolean;
}

export interface Report {
  id: string; title: string; report_type: string;
  content: string; created_at: string;
}

export interface AgentCommand {
  id: string; command: string; status: string;
  result: string; created_at: string; updated_at: string;
}
export interface AgentCommandResult extends AgentCommand { agent_online: boolean; }

export interface ProjectMemory {
  id: string; key: string; value: string;
  created_at: string; updated_at: string;
}

export interface Slide {
  id: string;
  type: "title" | "content" | "two_column";
  title: string;
  subtitle?: string;
  content?: string[];
  left_title?: string; left_content?: string[];
  right_title?: string; right_content?: string[];
  notes?: string;
}

export interface Presentation {
  id: string; project_id: string; topic: string;
  template: string; title: string; subtitle?: string;
  slides: Slide[]; created_at: string;
}

export interface PresentationSummary {
  id: string; title: string; topic: string;
  template: string; slide_count: number; created_at: string;
}

export interface SSETextEvent { type: "text"; content: string; }
export interface SSEActionEvent {
  type: "action";
  action: "task_created" | "command_sent" | "memory_saved" | "project_created" | "slides_generated";
  data: Record<string, unknown>;
}
export interface SSEDoneEvent { type: "done"; message_id: string; }
export type SSEEvent = SSETextEvent | SSEActionEvent | SSEDoneEvent;

export interface ProgressData {
  completion_rate: number;
  total: number;
  by_status: { todo: number; in_progress: number; done: number; archived: number };
  this_week: { created: number; completed: number };
}
export interface NotifSettings {
  project_id: string;
  summary_schedule: "daily" | "weekly" | "off";
}
export const progressApi = {
  get: (projectId: string) => api<ProgressData>(`/api/projects/${projectId}/progress`),
};
export const notificationsApi = {
  getSettings: (projectId: string) => api<NotifSettings>(`/api/notifications/settings/${projectId}`),
  updateSettings: (projectId: string, data: Partial<NotifSettings>) =>
    api<NotifSettings>(`/api/notifications/settings/${projectId}`, { method: "PATCH", body: JSON.stringify(data) }),
  triggerSummary: (projectId: string) =>
    api<{ message: string }>(`/api/notifications/summary/${projectId}`, { method: "POST" }),
};
