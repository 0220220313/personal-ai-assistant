"use client";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { MessageSquare, BookOpen, CheckSquare, FileBarChart, ArrowLeft, Presentation } from "lucide-react";
import { projectsApi, type Project } from "@/lib/api";

const TABS = [
  { key: "chat",      label: "對話",   icon: MessageSquare },
  { key: "knowledge", label: "知識庫", icon: BookOpen },
  { key: "tasks",     label: "任務",   icon: CheckSquare },
  { key: "reports",   label: "報告",   icon: FileBarChart },
  { key: "slides",    label: "簡報",   icon: Presentation },
];

interface Props {
  projectId: string;
  activeTab: string;
  children: React.ReactNode;
}

export default function ProjectLayout({ projectId, activeTab, children }: Props) {
  const [project, setProject] = useState<Project | null>(null);

  useEffect(() => {
    projectsApi.get(projectId).then(setProject).catch(() => {});
  }, [projectId]);

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-gray-900/80 backdrop-blur-sm sticky top-0 z-10">
        <Link href="/" className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded-lg transition-colors">
          <ArrowLeft size={16} />
        </Link>
        <div
          className="w-7 h-7 rounded-lg shrink-0"
          style={{ backgroundColor: project?.color || "#6366f1" }}
        />
        <h1 className="font-semibold text-white truncate text-sm">
          {project?.name || "載入中..."}
        </h1>
      </header>

      {/* Tab navigation */}
      <nav className="flex border-b border-gray-800 bg-gray-900/40 px-3 overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <Link
            key={key}
            href={}
            className={}
          >
            <Icon size={14} />
            {label}
          </Link>
        ))}
      </nav>

      {/* Content */}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
