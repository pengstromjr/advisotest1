"use client";

import { useState, useCallback, useLayoutEffect } from "react";
import { ProfileEditModal } from "@/components/profile-edit-modal";
import { WorkspaceTabs } from "@/components/workspace-tabs";
import { AIPanel } from "@/components/ai-panel";
import { Onboarding } from "@/components/onboarding";
import { useTheme } from "@/lib/theme-context";
import type { StudentContext } from "@/lib/course-data";

const ONBOARDING_KEY = "ucd-ai-onboarding-complete";

export default function Home() {
  const { theme, toggle } = useTheme();
  const [studentContext, setStudentContext] = useState<StudentContext>({
    major: "",
    year: "",
    completedCourses: [],
  });
  const [editOpen, setEditOpen] = useState(false);
  const [progress, setProgress] = useState({ completed: 0, total: 0 });
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    const completed = window.localStorage.getItem(ONBOARDING_KEY) === "true";
    if (completed) {
      setShowOnboarding(false);
    } else {
      setShowOnboarding(true);
    }
  }, []);

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

  const handleOnboardingComplete = () => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(ONBOARDING_KEY, "true");
    }
    setShowOnboarding(false);
  };

  // null = not yet read storage (show loading shell only). true = show onboarding. false = show main app.
  const onboardingOpen = showOnboarding === true;
  const showMainContent = showOnboarding === false;
  const showLoadingShell = showOnboarding === null;

  return (
    <div className="relative flex h-screen flex-col bg-gray-100 dark:bg-slate-950 transition-colors duration-300">
      {/* Header */}
      <header className="flex shrink-0 items-center justify-between bg-[#002855] px-5 py-2.5 text-white">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-[#DAAA00] text-xs font-bold text-[#002855]">
            UC
          </div>
          <h1 className="text-sm font-semibold">UC Davis AI Academic Advisor</h1>
        </div>
        {/* Dark mode toggle */}
        <button
          onClick={toggle}
          className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-white transition-all hover:bg-white/15 hover:border-white/40 shadow-sm"
          aria-label="Toggle dark mode"
        >
          {theme === "dark" ? (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          ) : (
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          )}
          <span className="tracking-wide uppercase text-[10px]">{theme === "dark" ? "Light Mode" : "Dark Mode"}</span>
        </button>
      </header>

      {/* Loading shell */}
      {showLoadingShell && (
        <div className="flex flex-1 items-center justify-center bg-gray-100 dark:bg-slate-950">
          <div className="text-sm text-gray-400">Loading...</div>
        </div>
      )}

      {/* Main split */}
      {showMainContent && (
        <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1fr_480px]">
          {/* Left workspace */}
          <div className="min-h-0 overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900 transition-colors duration-300">
            <WorkspaceTabs
              studentContext={studentContext}
              onToggleCourse={handleToggleCourse}
              onProgress={handleProgress}
            />
          </div>

          {/* Right AI panel */}
          <div className="min-h-0 overflow-y-auto rounded-2xl border border-gray-200/60 bg-white shadow-sm dark:border-slate-700/60 dark:bg-slate-900 transition-colors duration-300">
            <AIPanel
              studentContext={studentContext}
              completedCount={progress.completed}
              totalCount={progress.total}
              onEditProfile={() => setEditOpen(true)}
            />
          </div>
        </div>
      )}

      {/* Profile Edit Modal */}
      <ProfileEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        context={studentContext}
        onChange={setStudentContext}
      />

      {/* Onboarding */}
      <Onboarding
        open={onboardingOpen}
        context={studentContext}
        onChange={setStudentContext}
        onComplete={handleOnboardingComplete}
      />
    </div>
  );
}

