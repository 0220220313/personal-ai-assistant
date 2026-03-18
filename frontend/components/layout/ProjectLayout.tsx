"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MessageSquare, BookOpen, CheckSquare, FileBarChart, ArrowLeft, Settings, Archive } from "lucide-react";
import { projectsApi, type Project } from "@/lib/api";

interface Props {
  projectId: string;
  activeTab: "chat" | "knowledge" | "tasks" | "reports";
  children: React.ReactNode;
}

const TABS = [
  { key: "chat",      label: "對話",   icon: MessageSquare },
  { key: "knowledge", label: "知識庫", icon: BookOpen },
  { key: "tasks",     label: "任務",   icon: CheckSquare },
  { key: "reports",   label: "報告",   icon: FileBarChart },
] as const;

export default function ProjectLayout({ projectId, activeTab, children }: Props) {
  const [project, setProject] = useState<Project | null>(null);
  const router = useRouter();

  useEffect(() => {
    projectsApi.get(projectId).then(setProject).catch(() => router.push("/"));
  }, [projectId]);

  return (
    <div className="flex flex-col h-screen bg-gray-950">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900 shrink-0">
        <Link href="/" className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={18} />
        </Link>
        {project && (
          <>
            <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: project.color }} />
            <h1 className="font-semibold text-white truncate">{project.name}</h1>
          </>
        )}
      </header>

      {/* Tabs */}
      <nav className="flex border-b border-gray-800 bg-gray-900 shrink-0">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={`/projects/${projectId}/${key}`}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
              activeTab === key
                ? "border-indigo-500 text-indigo-400"
                : "border-transparent text-gray-500 hover:text-gray-300"
            }`}
          >
            <Icon size={14} />
            <span className="hidden sm:inline">{label}</span>
          </Link>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-hidden">
        {children}
      </main>
    </div>
  );
}
