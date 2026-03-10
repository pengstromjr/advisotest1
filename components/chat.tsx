"use client";

import { useState, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { MessageList } from "./message-list";
import type { StudentContext } from "@/lib/course-data";

interface ChatProps {
  studentContext: StudentContext;
}

const EXAMPLE_QUESTIONS = [
  "What are the prerequisites for ECN 100A?",
  "What courses do I still need for a Philosophy degree?",
  "Which Economics electives are recommended for finance?",
  "What GE requirements does PHI 001 satisfy?",
];

export function Chat({ studentContext }: ChatProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { messages, sendMessage, status, error } = useChat();

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
    <div className="flex flex-1 flex-col bg-gray-50/50 overflow-y-auto">
      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-4">
          {messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-6 py-24">
              <div className="text-center">
                <div className="mb-3 text-5xl">🎓</div>
                <h2 className="text-2xl font-semibold text-gray-900">
                  UC Davis AI Academic Advisor
                </h2>
                <p className="mt-2 max-w-md text-sm text-gray-500">
                  Ask me about courses, prerequisites, degree requirements, and
                  academic planning. I&apos;m here to help you navigate your UC
                  Davis journey.
                </p>
              </div>
              <div className="grid w-full max-w-lg grid-cols-1 gap-2 sm:grid-cols-2">
                {EXAMPLE_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => handleExampleClick(q)}
                    className="rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left text-sm text-gray-700 shadow-sm transition-colors hover:border-[#002855]/30 hover:bg-[#002855]/5"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <MessageList messages={messages} isLoading={isLoading} />
          )}
        </div>
      </div>

      {error && (
        <div className="mx-auto mb-2 max-w-3xl px-4">
          <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
            Something went wrong. Please check your API key and try again.
          </div>
        </div>
      )}

      <div className="border-t border-gray-200 bg-white p-4">
        <form
          onSubmit={handleSubmit}
          className="mx-auto flex max-w-3xl gap-2"
        >
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about courses, prerequisites, or degree requirements..."
            className="flex-1 rounded-xl border border-gray-300 px-4 py-3 text-sm outline-none transition-colors placeholder:text-gray-400 focus:border-[#002855] focus:ring-2 focus:ring-[#002855]/20"
            disabled={isLoading}
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-xl bg-[#002855] px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-[#001a3a] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
}
