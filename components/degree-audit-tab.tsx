"use client";

import type { StudentContext } from "@/lib/course-data";
import { DegreeAuditInline } from "./degree-audit-inline";

interface DegreeAuditTabProps {
  studentContext: StudentContext;
  onToggleCourse: (code: string) => void;
  onProgress: (completed: number, total: number) => void;
}

export function DegreeAuditTab({
  studentContext,
  onToggleCourse,
  onProgress,
}: DegreeAuditTabProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Degree Audit</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Check off completed courses. This syncs with the AI panel.
            </p>
          </div>
          <span className="text-xs text-gray-400">Spring 2026</span>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {studentContext.major ? (
          <DegreeAuditInline
            programName={studentContext.major}
            completedCourses={studentContext.completedCourses}
            onToggleCourse={onToggleCourse}
            onProgress={onProgress}
          />
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div>
              <p className="text-sm font-medium text-gray-600">
                Select a major to view your requirements.
              </p>
              <p className="mt-1 text-xs text-gray-400">
                Use “Edit profile” in the AI panel to pick a program.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

