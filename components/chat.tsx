"use client";

import { useState, useRef, useMemo } from "react";
import { useChat } from "@ai-sdk/react";
import { MessageList } from "./message-list";
import type { StudentContext } from "@/lib/course-data";

interface ChatProps {
  studentContext: StudentContext;
}

function getExampleQuestions(major: string): string[] {
  if (!major) {
    return [
      "What are the prerequisites for ECN 100A?",
      "What GE courses have the highest average GPA?",
      "Which professors have the best ratings?",
      "What GE requirements does PHI 001 satisfy?",
    ];
  }

  // Extract the short major name (e.g. "Computer Science" from "Computer Science, B.S.")
  const shortMajor = major.replace(/,\s*(B\.\w+|M\.\w+|Ph\.D\.)\.?$/i, "").trim();

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
    () => getExampleQuestions(studentContext.major),
    [studentContext.major]
  );

  const isLoading = status === "submitted" || status === "streaming";

  const handleSend = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    await sendMessage(
      { text: trimmed },
      { body: { studentContext } }
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
                <div className="mb-2 flex justify-center text-[#DAAA00]">
                  <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.436 60.436 0 00-.491 6.347A48.627 48.627 0 0112 20.904a48.627 48.627 0 018.232-4.41 60.46 60.46 0 00-.491-6.347m-15.482 0a50.57 50.57 0 00-2.658-.813A59.905 59.905 0 0112 3.493a59.902 59.902 0 0110.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.697 50.697 0 0112 13.489a50.702 50.702 0 017.74-3.342M6.75 15a.75.75 0 100-1.5.75.75 0 000 1.5zm0 0v-3.675A55.378 55.378 0 0112 8.443m-7.007 11.55A5.981 5.981 0 006.75 15.75v-1.5" />
                  </svg>
                </div>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  UC Davis AI Academic Advisor
                </h2>
                <p className="mt-1 max-w-xs text-xs text-gray-500 dark:text-slate-400">
                  Ask me about courses, prerequisites, degree requirements, and
                  academic planning. I&apos;m here to help you navigate your UC
                  Davis journey.
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
