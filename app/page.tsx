"use client";

import { useState, useCallback } from "react";
import { ProfileEditModal } from "@/components/profile-edit-modal";
import { WorkspaceTabs } from "@/components/workspace-tabs";
import { AIPanel } from "@/components/ai-panel";
import type { StudentContext } from "@/lib/course-data";

export default function Home() {
  const [studentContext, setStudentContext] = useState<StudentContext>({
    major: "",
    year: "",
    completedCourses: [],
  });
  const [editOpen, setEditOpen] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });

  const handleProgress = useCallback((completed: number, total: number) => {
    setProgress({ completed, total });
  }, []);

  const handleToggleCourse = useCallback(
    (code: string) => {
      const has = studentContext.completedCourses.includes(code);
      setStudentContext((prev) => ({
        ...prev,
        completedCourses: has
          ? prev.completedCourses.filter((c) => c !== code)
          : [...prev.completedCourses, code],
      }));
    },
    [studentContext.completedCourses]
  );

  return (
    <div className="flex h-screen flex-col bg-gray-100">
      {/* Header */}
      <header className="flex items-center justify-between bg-[#002855] px-5 py-2.5 text-white">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#DAAA00] text-xs font-bold text-[#002855]">
          UC
          </div>
          <h1 className="text-sm font-semibold">UC Davis AI Academic Advisor</h1>
        </div>

        {/* (Optional) Future: Simulate major switch dropdown */}
      </header>

      {/* Main split */}
      <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_420px]">
        {/* Left workspace */}
        <div className="min-h-0 overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
          <WorkspaceTabs
            studentContext={studentContext}
            onToggleCourse={handleToggleCourse}
            onProgress={handleProgress}
          />
        </div>

        {/* Right AI panel */}
        <div className="min-h-0 overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
          <AIPanel
            studentContext={studentContext}
            completedCount={progress.completed}
            totalCount={progress.total}
            onEditProfile={() => setEditOpen(true)}
          />
        </div>
      </div>

      {/* Profile Edit Modal */}
      <ProfileEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        context={studentContext}
        onChange={setStudentContext}
      />
    </div>
  );
}
