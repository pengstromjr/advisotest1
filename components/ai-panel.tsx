"use client";

import type { StudentContext } from "@/lib/course-data";
import { ProfileCard } from "./profile-card";
import { Chat } from "./chat";
import {
  ArrowDown,
  GraduationCap,
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
} from "lucide-react";

interface AIPanelProps {
  studentContext: StudentContext;
  completedCount: number;
  totalCount: number;
  onEditProfile: () => void;
  onMinimize: () => void;
}

export function AIPanel({
  studentContext,
  completedCount,
  totalCount,
  onEditProfile,
  onMinimize,
}: AIPanelProps) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-2.5 dark:border-slate-700">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#DAAA00]">
            AI Advisor
          </p>
          <p className="text-sm font-semibold text-[#002855] dark:text-white">
            Adviso chat
          </p>
        </div>
        <button
          type="button"
          onClick={onMinimize}
          aria-label="Minimize AI advisor"
          title="Minimize AI advisor"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-500 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#002855]/30 hover:text-[#002855] hover:shadow-md dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:border-[#DAAA00]/40 dark:hover:text-[#DAAA00]"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>

      {/* Top: profile summary */}
      <div className="shrink-0 border-b border-gray-100 dark:border-slate-700 p-4">
        <ProfileCard
          studentContext={studentContext}
          completedCount={completedCount}
          totalCount={totalCount}
          onEditClick={onEditProfile}
        />
      </div>

      {/* Bottom: chat - takes all remaining space */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <Chat studentContext={studentContext} />
      </div>
    </div>
  );
}

interface MinimizedAIPanelProps {
  studentContext: StudentContext;
  completedCount: number;
  totalCount: number;
  onEditProfile: () => void;
  onRestore: () => void;
}

function formatProgramName(program: string): string {
  return program.replace(/,\s*(Bachelor|Master|Doctor).+$/i, "").trim();
}

function MiniProgressRing({
  percentage,
  label,
  size = 48,
  strokeWidth = 4,
}: {
  percentage: number;
  label?: string;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="rotate-[-90deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-gray-200 dark:text-slate-700"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="text-[#DAAA00] transition-all duration-500"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-black text-[#002855] dark:text-white">
        {label ?? `${percentage}%`}
      </span>
    </div>
  );
}

export function MinimizedAIPanel({
  studentContext,
  completedCount,
  totalCount,
  onEditProfile,
  onRestore,
}: MinimizedAIPanelProps) {
  const pct =
    totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const hasCheckableProgress = totalCount > 0;
  const majorLabel = studentContext.major ? formatProgramName(studentContext.major) : "";
  const targetLabel = studentContext.targetMajor
    ? formatProgramName(studentContext.targetMajor)
    : "";
  const hasGoalMajor = Boolean(targetLabel);

  return (
    <>
      <div className="flex h-full items-center gap-3 overflow-hidden bg-white px-3 dark:bg-slate-900 lg:hidden">
        <button
          type="button"
          onClick={onRestore}
          aria-label="Open minimized AI advisor chat"
          title="Open minimized AI advisor chat"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#002855] text-white shadow-lg shadow-[#002855]/20 transition-all hover:-translate-y-0.5 hover:bg-[#001a3a] dark:shadow-black/30"
        >
          <MessageSquareText className="h-5 w-5" />
        </button>
        <button
          type="button"
          onClick={onRestore}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-[10px] font-black uppercase tracking-[0.16em] text-[#DAAA00]">
            AI Advisor
          </p>
          <p className="truncate text-sm font-semibold text-[#002855] dark:text-white">
            Chat minimized
          </p>
        </button>
        <div title={hasCheckableProgress ? `${completedCount}/${totalCount} courses` : "Catalog-note requirements"}>
          <MiniProgressRing
            percentage={pct}
            label={hasCheckableProgress ? undefined : "Info"}
            size={36}
            strokeWidth={3.5}
          />
        </div>
        <button
          type="button"
          onClick={onRestore}
          aria-label="Expand minimized AI advisor"
          title="Expand minimized AI advisor"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition-all hover:border-[#002855]/30 hover:text-[#002855] dark:border-slate-700 dark:text-slate-400 dark:hover:border-[#DAAA00]/40 dark:hover:text-[#DAAA00]"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </div>

      <div className="hidden h-full min-h-0 flex-col items-center overflow-hidden bg-white dark:bg-slate-900 lg:flex">
      <button
        type="button"
        onClick={onRestore}
        aria-label="Open AI advisor chat"
        title="Open AI advisor chat"
        className="group flex w-full flex-col items-center gap-3 border-b border-gray-100 px-2 py-4 transition-colors hover:bg-[#002855]/5 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#002855] text-white shadow-lg shadow-[#002855]/20 transition-transform group-hover:-translate-y-0.5 dark:shadow-black/30">
          <MessageSquareText className="h-5 w-5" />
        </span>
        <span className="text-center text-[10px] font-black uppercase leading-3 tracking-[0.18em] text-[#DAAA00]">
          AI
          <br />
          Advisor
        </span>
      </button>

      <div className="flex w-full flex-1 flex-col items-center gap-4 px-2 py-4">
        <div title={hasCheckableProgress ? `${completedCount}/${totalCount} courses` : "Catalog-note requirements"}>
          <MiniProgressRing percentage={pct} label={hasCheckableProgress ? undefined : "Info"} />
        </div>

        <div className="h-px w-10 bg-gray-200 dark:bg-slate-700" />

        <div
          className="flex flex-col items-center gap-1.5"
          title={
            hasGoalMajor
              ? `${majorLabel} to ${targetLabel}`
              : majorLabel || "Student profile"
          }
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[#002855]/10 bg-[#002855]/8 text-[#002855] dark:border-[#DAAA00]/20 dark:bg-[#DAAA00]/10 dark:text-[#DAAA00]">
            <GraduationCap className="h-5 w-5" />
          </div>
          {hasGoalMajor && (
            <>
              <ArrowDown className="h-3.5 w-3.5 text-gray-300 dark:text-slate-600" />
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#DAAA00]/20 text-[#002855] dark:bg-[#DAAA00]/15 dark:text-[#DAAA00]">
                <GraduationCap className="h-4 w-4" />
              </div>
            </>
          )}
          {hasGoalMajor ? (
            <div
              aria-hidden="true"
              className="mt-0.5 flex flex-col items-center gap-1"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-[#002855] dark:bg-[#DAAA00]" />
              <span className="h-1.5 w-1.5 rounded-full bg-[#DAAA00]" />
            </div>
          ) : (
            <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-[#DAAA00]" />
          )}
        </div>

        <button
          type="button"
          onClick={onEditProfile}
          aria-label="Edit profile"
          title="Edit profile"
          className="mt-1 flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-gray-500 transition-all hover:-translate-y-0.5 hover:border-[#002855]/30 hover:text-[#002855] hover:shadow-md dark:border-slate-700 dark:text-slate-400 dark:hover:border-[#DAAA00]/40 dark:hover:text-[#DAAA00]"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </div>

      <div className="w-full border-t border-gray-100 p-2 dark:border-slate-700">
        <button
          type="button"
          onClick={onRestore}
          aria-label="Restore AI advisor"
          title="Restore AI advisor"
          className="flex h-11 w-full items-center justify-center rounded-xl bg-[#002855] text-white shadow-lg shadow-[#002855]/15 transition-all hover:-translate-y-0.5 hover:bg-[#001a3a] dark:shadow-black/30"
        >
          <PanelRightOpen className="h-5 w-5" />
        </button>
      </div>
      </div>
    </>
  );
}
