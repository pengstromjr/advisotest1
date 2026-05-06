"use client";

import { useState, useRef, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { getAdvisingGoals } from "@/lib/advising-goals";
import { MessageList } from "./message-list";
import type { StudentContext } from "@/lib/course-data";
import {
  getStoredBlockedTimes,
  getStoredPlannedSections,
} from "@/lib/schedule-state";
import { AI_CHAT_NOTICE } from "@/lib/legal-notices";

interface ChatProps {
  studentContext: StudentContext;
}

function formatProgramName(program: string): string {
  return program.replace(/,\s*(Bachelor|Master|Doctor).+$/i, "").trim();
}

function getExampleQuestions(studentContext: StudentContext): string[] {
  const { major, targetMajor, advisingGoal } = studentContext;
  const advisingGoals = studentContext.advisingGoals?.length
    ? studentContext.advisingGoals
    : advisingGoal
      ? [advisingGoal]
      : [];
  const shortMajor = major ? formatProgramName(major) : "my current major";
  const shortTargetMajor = targetMajor
    ? formatProgramName(targetMajor)
    : "my goal major";
  const secondaryMajor = studentContext.secondaryMajor
    ? formatProgramName(studentContext.secondaryMajor)
    : "";
  const minorLabels = (studentContext.minors || []).map(formatProgramName);
  const extraPrograms = [secondaryMajor, ...minorLabels].filter(Boolean);
  const goals = getAdvisingGoals(advisingGoals);

  if (advisingGoals.includes("change-major")) {
    return [
      `What would it take to switch from ${shortMajor} to ${shortTargetMajor}?`,
      `Which completed courses would still count for ${shortTargetMajor}?`,
      "What GPA or prerequisite risks should I watch for?",
      "Build a next-quarter plan for changing majors",
    ];
  }

  if (advisingGoals.includes("boost-gpa")) {
    return [
      "Which GE courses have strong grade distributions?",
      "How should I balance a lighter workload next quarter?",
      "Which courses should I avoid taking together?",
      `Find manageable classes that still help ${shortMajor}`,
    ];
  }

  if (advisingGoals.includes("optimize-schedule")) {
    return [
      "Build me a balanced 4-course schedule",
      "Which classes fit around my blocked times?",
      "What courses should I pair carefully?",
      "Find open sections with strong instructors",
    ];
  }

  if (extraPrograms.length > 0) {
    return [
      "Which courses overlap across my programs?",
      `What should I prioritize for ${shortMajor} and ${extraPrograms[0]}?`,
      "Can you build a plan that keeps both programs realistic?",
      "Which completed courses count toward more than one program?",
    ];
  }

  if (!major) {
    return [
      goals.length
        ? `How can Adviso help me with ${goals.map((g) => g.label.toLowerCase()).join(" and ")}?`
        : "What are the prerequisites for ECN 100A?",
      "What GE courses have the highest average GPA?",
      "Which professors have the best ratings?",
      "What GE requirements does PHI 001 satisfy?",
    ];
  }

  return [
    `What courses do I still need for ${shortMajor}?`,
    `Which ${shortMajor} electives have the best grade distributions?`,
    `Who are the highest-rated professors in ${shortMajor}?`,
    `Build me a 4-course schedule for next quarter`,
  ];
}

export function Chat({ studentContext }: ChatProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { messages, sendMessage, status, error } = useChat();
  const exampleQuestions = useMemo(
    () => getExampleQuestions(studentContext),
    [studentContext]
  );

  const isLoading = status === "submitted" || status === "streaming";

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    const liveStudentContext: StudentContext = {
      ...studentContext,
      blockedTimes: getStoredBlockedTimes(),
      plannedSections: getStoredPlannedSections(),
    };
    await sendMessage(
      { text: trimmed },
      { body: { studentContext: liveStudentContext } }
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    handleSend(input);
  };

  const handleExampleClick = (question: string) => {
    setInput(question);
    inputRef.current?.focus();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-gray-50/50 dark:bg-slate-900/50">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4">
          {messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-4 py-8">
              <div className="text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span className="text-2xl font-black tracking-tighter text-[#002855] dark:text-white">Adviso</span>
                  </div>
                <h2 className="text-base font-medium text-gray-600 dark:text-slate-400">
                  AI Academic Advisor
                </h2>
                <p className="mt-1 max-w-xs text-xs text-gray-500 dark:text-slate-400">
                  Ask me about courses, prerequisites, degree requirements, and
                  academic planning. I&apos;m here to help you navigate your
                  academic journey.
                </p>
              </div>
              <div className="grid w-full max-w-sm grid-cols-1 gap-1.5 sm:grid-cols-2">
                {exampleQuestions.map((q: string) => (
                  <button
                    key={q}
                    onClick={() => handleExampleClick(q)}
                    className="rounded-lg border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-800 px-2.5 py-2 text-left text-xs text-gray-700 dark:text-slate-300 shadow-sm transition-colors hover:border-[#002855]/30 hover:bg-[#002855]/5 dark:hover:bg-slate-700"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <MessageList
              messages={messages}
              isLoading={isLoading}
              completedCourses={studentContext.completedCourses}
            />
          )}
        </div>
      </div>

      {error && (
        <div className="mx-auto mb-2 max-w-3xl px-4">
          <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
            Something went wrong. Please check your API key and try again.
          </div>
        </div>
      )}

      <div className="shrink-0 border-t border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3">
        <p className="mx-auto mb-2 max-w-3xl text-[11px] leading-5 text-gray-500 dark:text-slate-400">
          {AI_CHAT_NOTICE}
        </p>
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-3xl gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about courses, prerequisites, or degree requirements..."
            className="flex-1 rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2.5 text-sm text-gray-900 dark:text-white outline-none transition-colors placeholder:text-gray-400 dark:placeholder:text-slate-500 focus:border-[#002855] focus:ring-2 focus:ring-[#002855]/20"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl bg-[#002855] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#001a3a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
