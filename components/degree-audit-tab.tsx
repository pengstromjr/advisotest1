"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatProgramName, selectedAuditPrograms } from "@/lib/academic-plan";
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
  const auditPrograms = useMemo(
    () => selectedAuditPrograms(studentContext),
    [studentContext]
  );
  const [activeProgramId, setActiveProgramId] = useState("");

  useEffect(() => {
    if (auditPrograms.length === 0) {
      setActiveProgramId("");
      onProgress(0, 0);
      return;
    }
    setActiveProgramId((current) =>
      auditPrograms.some((program) => program.id === current)
        ? current
        : auditPrograms[0].id
    );
  }, [auditPrograms, onProgress]);

  const activeProgram =
    auditPrograms.find((program) => program.id === activeProgramId) ||
    auditPrograms[0];
  const handleProgramProgress = useCallback(
    (completed: number, total: number) => {
      if (!activeProgram || activeProgram.id === "primary-major") {
        onProgress(completed, total);
      }
    },
    [activeProgram, onProgress]
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-gray-100 dark:border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Degree Audit</h2>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
            Check off completed courses. This syncs with the AI panel.
          </p>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {activeProgram ? (
          <>
            {auditPrograms.length > 1 && (
              <div className="border-b border-gray-100 bg-gray-50/70 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400 dark:text-slate-500">
                  Audit program
                </p>
                <div className="flex flex-wrap gap-2">
                  {auditPrograms.map((program) => {
                    const selected = program.id === activeProgram.id;
                    return (
                      <button
                        key={program.id}
                        type="button"
                        onClick={() => setActiveProgramId(program.id)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-all ${
                          selected
                            ? "border-[#002855] bg-[#002855] text-white shadow-sm dark:border-[#DAAA00] dark:bg-[#DAAA00] dark:text-[#002855]"
                            : "border-gray-200 bg-white text-gray-600 hover:border-[#002855]/30 hover:text-[#002855] dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-[#DAAA00]/40 dark:hover:text-[#DAAA00]"
                        }`}
                      >
                        <span className="text-[10px] uppercase tracking-wide opacity-70">
                          {program.label}:{" "}
                        </span>
                        <span className="ml-1">
                          {formatProgramName(program.value)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            <DegreeAuditInline
              key={activeProgram.id}
              programName={activeProgram.value}
              studentContext={studentContext}
              onToggleCourse={onToggleCourse}
              onProgress={handleProgramProgress}
            />
          </>
        ) : (
          <div className="flex h-full items-center justify-center p-8 text-center">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-slate-300">
                Select a major to view your requirements.
              </p>
              <p className="mt-1 text-xs text-gray-400 dark:text-slate-500">
                Use “Edit profile” in the AI panel to pick a program.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
