"use client";

import { useState } from "react";
import type { StudentContext } from "@/lib/course-data";
import { DegreeAuditTab } from "./degree-audit-tab";
import { SchedulePlannerTab } from "./schedule-planner/schedule-planner-tab";
import { DiscoveryHub } from "./schedule-planner/discovery-hub";
import { Sparkles } from "lucide-react";

type WorkspaceTab = "audit" | "planner" | "discovery";

interface WorkspaceTabsProps {
  studentContext: StudentContext;
  onToggleCourse: (code: string) => void;
  onProgress: (completed: number, total: number) => void;
  aiPanelMinimized?: boolean;
  onRequestAIMinimize?: () => void;
}

export function WorkspaceTabs({
  studentContext,
  onToggleCourse,
  onProgress,
  aiPanelMinimized = false,
  onRequestAIMinimize,
}: WorkspaceTabsProps) {
  const [active, setActive] = useState<WorkspaceTab>("audit");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="grid grid-cols-3 items-center gap-1 border-b border-gray-200 bg-gray-50 px-2 py-2 dark:border-slate-700 dark:bg-slate-900/50 sm:flex sm:gap-2 sm:px-3">
        <button
          onClick={() => setActive("audit")}
          className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all sm:shrink-0 sm:gap-2 sm:px-3 sm:text-sm ${
            active === "audit"
              ? "bg-white dark:bg-blue-600/90 text-[#002855] dark:text-white shadow-sm ring-1 ring-black/5"
              : "text-gray-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-white"
          }`}
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <span className="truncate sm:hidden">Audit</span>
          <span className="hidden sm:inline">Degree Audit</span>
        </button>
        <button
          onClick={() => setActive("planner")}
          className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all sm:shrink-0 sm:gap-2 sm:px-3 sm:text-sm ${
            active === "planner"
              ? "bg-white dark:bg-blue-600/90 text-[#002855] dark:text-white shadow-sm ring-1 ring-black/5"
              : "text-gray-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-white"
          }`}
        >
          <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="truncate sm:hidden">Schedule</span>
          <span className="hidden sm:inline">Schedule Planner</span>
        </button>
        <button
          onClick={() => setActive("discovery")}
          className={`inline-flex min-w-0 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition-all sm:shrink-0 sm:gap-2 sm:px-3 sm:text-sm ${
            active === "discovery"
              ? "bg-white dark:bg-blue-600/90 text-[#002855] dark:text-white shadow-sm ring-1 ring-black/5"
              : "text-gray-500 dark:text-slate-400 hover:bg-white/60 dark:hover:bg-slate-800 hover:text-gray-700 dark:hover:text-white"
          }`}
        >
          <Sparkles className="h-4 w-4" />
          <span className="truncate sm:hidden">Discover</span>
          <span className="hidden sm:inline">Discovery</span>
        </button>

      </div>

      <div className="min-h-0 flex-1 overflow-hidden relative">
        <div className={`h-full ${active === "audit" ? "" : "hidden"}`}>
          <DegreeAuditTab
            studentContext={studentContext}
            onToggleCourse={onToggleCourse}
            onProgress={onProgress}
          />
        </div>
        <div className={`h-full ${active === "planner" ? "" : "hidden"}`}>
          <SchedulePlannerTab
            studentContext={studentContext}
            aiPanelMinimized={aiPanelMinimized}
          />
        </div>
        <div className={`h-full ${active === "discovery" ? "" : "hidden"}`}>
          <DiscoveryHub
            studentContext={studentContext}
            onRequestAIMinimize={onRequestAIMinimize}
          />
        </div>
      </div>
    </div>
  );
}
