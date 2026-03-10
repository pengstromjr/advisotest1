"use client";

import { useState } from "react";
import type { StudentContext } from "@/lib/course-data";
import { DegreeAuditTab } from "./degree-audit-tab";
import { SchedulePlannerTab } from "./schedule-planner/schedule-planner-tab";

type WorkspaceTab = "audit" | "planner";

interface WorkspaceTabsProps {
  studentContext: StudentContext;
  onToggleCourse: (code: string) => void;
  onProgress: (completed: number, total: number) => void;
}

export function WorkspaceTabs({
  studentContext,
  onToggleCourse,
  onProgress,
}: WorkspaceTabsProps) {
  const [active, setActive] = useState<WorkspaceTab>("audit");

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <button
          onClick={() => setActive("audit")}
          className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            active === "audit"
              ? "bg-white text-[#002855] shadow-sm"
              : "text-gray-500 hover:bg-white/60 hover:text-gray-700"
          }`}
        >
          <span className="text-xs">▦</span>
          Degree Audit
        </button>
        <button
          onClick={() => setActive("planner")}
          className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            active === "planner"
              ? "bg-white text-[#002855] shadow-sm"
              : "text-gray-500 hover:bg-white/60 hover:text-gray-700"
          }`}
        >
          <span className="text-xs">🗓</span>
          Schedule Planner
        </button>

        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-gray-400">Spring 2026</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {active === "audit" ? (
          <DegreeAuditTab
            studentContext={studentContext}
            onToggleCourse={onToggleCourse}
            onProgress={onProgress}
          />
        ) : (
          <SchedulePlannerTab studentContext={studentContext} />
        )}
      </div>
    </div>
  );
}

