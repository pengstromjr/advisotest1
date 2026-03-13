"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { StudentContext } from "@/lib/course-data";
import type { TimeBlock } from "@/lib/time-blocks";
import { loadTimeBlocks, saveTimeBlocks, snapTo15Minutes, BLOCK_COLORS } from "@/lib/time-blocks";

interface OnboardingProps {
  open: boolean;
  context: StudentContext;
  onChange: (ctx: StudentContext) => void;
  onComplete: () => void;
}

const YEARS: { label: string; desc: string; icon: string }[] = [
  { label: "Freshman", desc: "1st year / 0-44 units", icon: "1" },
  { label: "Sophomore", desc: "2nd year / 45-89 units", icon: "2" },
  { label: "Junior", desc: "3rd year / 90-134 units", icon: "3" },
  { label: "Senior", desc: "4th year / 135+ units", icon: "4" },
];

type Step = 0 | 1 | 2 | 3 | 4 | 5;

const BLOCKS_STORAGE_KEY = "ucd-ai-blocked-times-spring-2026";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
const START_HOUR = 8;
const END_HOUR = 22;
// No snapping: allow blocks to start/end at any minute.
const SLOT_MINUTES = 1;
const TOTAL_MINUTES = (END_HOUR - START_HOUR) * 60;

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function formatDisplayTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hour12 = ((h + 11) % 12) + 1;
  const suffix = h < 12 ? "am" : "pm";
  return `${hour12}:${m.toString().padStart(2, "0")}${suffix}`;
}

function parseTimeToMinutesLocal(time: string): number {
  const [h, m] = time.split(":").map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return START_HOUR * 60;
  return h * 60 + m;
}

function getMinutesFromPointer(clientY: number, rect: DOMRect, snap: boolean = false): number {
  const offset = Math.min(Math.max(clientY - rect.top, 0), rect.height);
  const ratio = rect.height === 0 ? 0 : offset / rect.height;
  let minutesFromStart = Math.round((ratio * TOTAL_MINUTES) / SLOT_MINUTES) * SLOT_MINUTES;
  if (snap) {
    minutesFromStart = snapTo15Minutes(minutesFromStart);
  }
  const absolute = START_HOUR * 60 + minutesFromStart;
  const min = START_HOUR * 60;
  const max = END_HOUR * 60;
  return Math.min(Math.max(absolute, min), max);
}

function getBlockPosition(startTime: string, endTime: string) {
  const start = parseTimeToMinutesLocal(startTime);
  const end = parseTimeToMinutesLocal(endTime);
  const clampedStart = Math.max(start, START_HOUR * 60);
  const clampedEnd = Math.min(end, END_HOUR * 60);
  if (clampedEnd <= clampedStart) {
    return { top: 0, height: 0 };
  }
  const minutesFromStart = clampedStart - START_HOUR * 60;
  const duration = clampedEnd - clampedStart;
  const top = (minutesFromStart / TOTAL_MINUTES) * 100;
  const height = (duration / TOTAL_MINUTES) * 100;
  return { top, height };
}

export function Onboarding({
  open,
  context,
  onChange,
  onComplete,
}: OnboardingProps) {
  const [step, setStep] = useState<Step>(0);
  const [dir, setDir] = useState<"forward" | "back">("forward");
  const [programs, setPrograms] = useState<string[]>([]);
  const [majorInput, setMajorInput] = useState("");
  const [closing, setClosing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsedCodes, setParsedCodes] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [dragging, setDragging] = useState<{
    dayIdx: number;
    startMinutes: number;
    currentMinutes: number;
    rect: DOMRect;
  } | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  useEffect(() => {
    if (!open) return;
    setStep(0);
    setDir("forward");
    setMajorInput("");
    setClosing(false);

    // Load any previously saved time blocks.
    const existing = loadTimeBlocks(BLOCKS_STORAGE_KEY);
    setTimeBlocks(existing);
    setDragging(null);
    setEditingBlockId(null);
    setEditingLabel("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    fetch("/api/data")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data.programs)) setPrograms(data.programs);
      })
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    if (step === 1) {
      setTimeout(() => inputRef.current?.focus(), 350);
    }
  }, [step]);

  const filteredPrograms = useMemo(() => {
    const q = majorInput.toLowerCase().trim();
    if (!q) return programs.slice(0, 20);
    return programs.filter((p) => p.toLowerCase().includes(q)).slice(0, 20);
  }, [programs, majorInput]);

  if (!open) return null;

  const goTo = (next: Step) => {
    setDir(next > step ? "forward" : "back");
    setStep(next);
  };

  const handleSelectMajor = (program: string) => {
    onChange({ ...context, major: program });
    setMajorInput(program);
    setTimeout(() => goTo(2), 200);
  };

  const handleSelectYear = (year: string) => {
    onChange({ ...context, year });
    setTimeout(() => goTo(3), 200);
  };

  const handleFinish = () => {
    setClosing(true);
    setTimeout(onComplete, 400);
  };

  const handleParseTranscript = async () => {
    const text = transcript.trim();
    if (!text) {
      setParsedCodes([]);
      setParseError("");
      return;
    }
    setParsing(true);
    setParseError("");
    try {
      const res = await fetch("/api/parse-transcript", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });
      if (!res.ok) {
        const err = (await res.json()).catch(() => ({}));
        throw new Error(err?.error || "Failed");
      }
      const data = (await res.json()) as { codes?: string[] };
      const unique = Array.from(new Set((data.codes || []).filter(Boolean)));
      setParsedCodes(unique);

      const merged = Array.from(
        new Set([...(context.completedCourses || []), ...unique])
      );
      onChange({ ...context, completedCourses: merged });

      if (unique.length === 0) {
        setParseError(
          "No course codes found (e.g. MAT 21A, ECN 001). Try pasting a line that includes department and number."
        );
      }
    } catch (e) {
      setParseError(
        e instanceof Error ? e.message : "Could not read that transcript. You can still edit courses later."
      );
    } finally {
      setParsing(false);
    }
  };

  const slideClass = (target: Step) => {
    if (target === step)
      return "translate-x-0 opacity-100 scale-100";
    if (dir === "forward")
      return target < step
        ? "-translate-x-full opacity-0 scale-95"
        : "translate-x-full opacity-0 scale-95";
    return target > step
      ? "translate-x-full opacity-0 scale-95"
      : "-translate-x-full opacity-0 scale-95";
  };

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center transition-all duration-400 ${
        closing ? "opacity-0 scale-105" : "opacity-100 scale-100"
      }`}
      style={{ background: "linear-gradient(135deg, #002855 0%, #00427a 50%, #005a9e 100%)" }}
    >
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute -top-1/2 -left-1/4 h-[800px] w-[800px] rounded-full opacity-[0.07]"
          style={{ background: "radial-gradient(circle, #DAAA00 0%, transparent 70%)" }}
        />
        <div
          className="absolute -bottom-1/3 -right-1/4 h-[600px] w-[600px] rounded-full opacity-[0.05]"
          style={{ background: "radial-gradient(circle, #DAAA00 0%, transparent 70%)" }}
        />
      </div>

      <div className={`relative z-10 mx-4 w-full transition-all duration-400 ${step === 4 ? "max-w-3xl" : "max-w-xl"}`}>
        {/* Progress dots */}
        <div className="mb-6 flex items-center justify-center gap-2">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className={`h-2 rounded-full transition-all duration-300 ${
                i === step
                  ? "w-8 bg-[#DAAA00]"
                  : i < step
                    ? "w-2 bg-[#DAAA00]/60"
                    : "w-2 bg-white/30"
              }`}
            />
          ))}
        </div>

        <div className={`relative overflow-hidden rounded-3xl bg-white shadow-2xl transition-all duration-400 ${step === 4 ? "min-h-[600px]" : "min-h-[460px]"}`}>
          {/* Step 0: Welcome */}
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center p-8 transition-all duration-400 ease-out ${slideClass(0)} ${step !== 0 ? "pointer-events-none" : ""}`}
          >
            <div className="mb-2 flex h-20 w-20 items-center justify-center rounded-2xl bg-[#002855]">
              <span className="text-3xl font-black text-[#DAAA00]">UC</span>
            </div>
            <h1 className="mt-4 text-2xl font-bold text-gray-900">
              Welcome, Aggie!
            </h1>
            <p className="mt-2 max-w-xs text-center text-sm text-gray-500">
              Let&apos;s set up your AI academic advisor in just a couple of
              quick steps.
            </p>
            <button
              type="button"
              onClick={() => goTo(1)}
              className="mt-8 rounded-xl bg-[#002855] px-8 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-[#001a3a] hover:shadow-xl active:scale-[0.98]"
            >
              Get Started
            </button>
          </div>

          {/* Step 1: Major */}
          <div
            className={`absolute inset-0 flex flex-col p-8 sm:p-12 transition-all duration-500 ease-out ${slideClass(1)} ${step !== 1 ? "pointer-events-none" : ""}`}
          >
            <div className="mb-1 flex items-center gap-3">
              <button
                type="button"
                onClick={() => goTo(0)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Go back"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#DAAA00]">
                  Step 1 of 4
                </p>
                <h2 className="text-lg font-bold text-gray-900">
                  What&apos;s your major?
                </h2>
              </div>
            </div>
            <p className="mb-5 pl-11 text-base text-gray-500">
              We&apos;ll use this to personalize your degree audit and course
              suggestions.
            </p>

            <div className="relative pl-11 max-w-lg">
              <svg
                className="absolute left-[3.1rem] top-3 h-5 w-5 text-gray-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                value={majorInput}
                onChange={(e) => setMajorInput(e.target.value)}
                placeholder="Search programs..."
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-3 pl-10 pr-4 text-base outline-none transition-colors focus:border-[#002855] focus:bg-white focus:ring-2 focus:ring-[#002855]/20"
              />
            </div>

            <div className="mt-4 min-h-0 flex-1 overflow-y-auto pl-11 max-w-lg scrollbar-thin scrollbar-thumb-gray-200 scrollbar-track-transparent pr-2">
              {filteredPrograms.length === 0 ? (
                <p className="py-6 text-center text-xs text-gray-400">
                  No programs match your search.
                </p>
              ) : (
                <div className="space-y-1 pb-2">
                  {filteredPrograms.map((p) => {
                    const selected = p === context.major;
                    return (
                      <button
                        key={p}
                        type="button"
                        onClick={() => handleSelectMajor(p)}
                        className={`flex w-full items-center gap-4 rounded-xl border px-4 py-3 text-left text-base transition-all ${
                          selected
                            ? "border-[#002855] bg-[#002855]/5 font-medium text-[#002855]"
                            : "border-transparent bg-white text-gray-800 hover:border-gray-200 hover:bg-gray-50"
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                            selected
                              ? "border-[#002855] bg-[#002855]"
                              : "border-gray-300"
                          }`}
                        >
                          {selected && (
                            <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                            </svg>
                          )}
                        </span>
                        <span className="truncate">{p}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Step 2: Year */}
          <div
            className={`absolute inset-0 flex flex-col p-8 sm:p-12 transition-all duration-500 ease-out ${slideClass(2)} ${step !== 2 ? "pointer-events-none" : ""}`}
          >
            <div className="mb-1 flex items-center gap-3">
              <button
                type="button"
                onClick={() => goTo(1)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Go back"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#DAAA00]">
                  Step 2 of 4
                </p>
                <h2 className="text-lg font-bold text-gray-900">
                  What year are you?
                </h2>
              </div>
            </div>
            <p className="mb-8 pl-11 text-base text-gray-500">
              This helps us tailor recommendations to where you are in your
              degree.
            </p>

            <div className="flex flex-1 items-start pl-11 pr-4 pb-4">
              <div className="grid w-full max-w-lg grid-cols-2 gap-4">
              {YEARS.map((y) => {
                const selected = context.year === y.label;
                return (
                  <button
                    key={y.label}
                    type="button"
                    onClick={() => handleSelectYear(y.label)}
                    className={`group flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all ${
                      selected
                        ? "border-[#002855] bg-[#002855]/5 shadow-sm"
                        : "border-gray-200 bg-white hover:border-[#002855]/40 hover:shadow-sm"
                    }`}
                  >
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-sm font-bold transition-colors ${
                        selected
                          ? "bg-[#002855] text-white"
                          : "bg-gray-100 text-gray-500 group-hover:bg-[#002855]/10 group-hover:text-[#002855]"
                      }`}
                    >
                      {y.icon}
                    </span>
                    <div>
                      <p className={`text-[15px] font-semibold ${selected ? "text-[#002855]" : "text-gray-900"}`}>
                        {y.label}
                      </p>
                      <p className="text-xs text-gray-500">{y.desc}</p>
                    </div>
                  </button>
                );
              })}
              </div>
            </div>
          </div>

          {/* Step 3: Transcript */}
          <div
            className={`absolute inset-0 flex flex-col p-8 sm:p-12 transition-all duration-500 ease-out ${slideClass(3)} ${
              step !== 3 ? "pointer-events-none" : ""
            }`}
          >
            <div className="mb-1 flex items-center gap-3">
              <button
                type="button"
                onClick={() => goTo(2)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Go back"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#DAAA00]">
                  Step 3 of 4
                </p>
                <h2 className="text-lg font-bold text-gray-900">
                  Paste your unofficial transcript (optional)
                </h2>
              </div>
            </div>
            <p className="mb-6 pl-11 max-w-lg text-base text-gray-500">
              We&apos;ll scan it for course codes (e.g., ECN 001, MAT 021B) and
              mark them as completed in your degree audit.
            </p>

            <div className="flex min-h-0 flex-1 flex-col gap-4 pl-11 max-w-xl pr-2">
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Copy and paste text from your unofficial transcript here..."
                className="h-40 w-full flex-1 resize-none rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm leading-relaxed text-gray-800 outline-none transition-colors focus:border-[#002855] focus:bg-white focus:ring-2 focus:ring-[#002855]/20"
              />
              <div className="flex items-center justify-between text-sm text-gray-500 mt-2">
                <button
                  type="button"
                  onClick={handleParseTranscript}
                  disabled={parsing || !transcript.trim()}
                  className="inline-flex items-center gap-1 rounded-lg bg-[#002855] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#001a3a] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {parsing ? (
                    <>
                      <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      Scanning...
                    </>
                  ) : (
                    <>Scan transcript</>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => goTo(4)}
                  className="text-xs font-medium text-gray-400 hover:text-gray-600"
                >
                  Skip transcript
                </button>
              </div>

              {parseError && (
                <p className="mt-1 text-xs text-red-500">{parseError}</p>
              )}

              {parsedCodes.length > 0 && (
                <div className="mt-2 rounded-xl border border-green-100 bg-green-50 p-2.5 text-[11px] text-gray-700">
                  <p className="mb-1 font-semibold text-green-700">
                    Detected {parsedCodes.length} completed course
                    {parsedCodes.length > 1 ? "s" : ""}:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {parsedCodes.map((c) => (
                      <span
                        key={c}
                        className="rounded-full bg-white px-2 py-0.5 text-[10px] font-medium text-gray-800"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-[10px] text-gray-500">
                    You can always edit this list later from the profile panel
                    or degree audit.
                  </p>
                </div>
              )}

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => goTo(4)}
                  className="rounded-xl bg-[#002855] px-6 py-3 text-base font-semibold text-white shadow-sm transition-colors hover:bg-[#001a3a]"
                >
                  Next
                </button>
                <span className="text-xs text-gray-400">
                  or skip this step
                </span>
                <button
                  type="button"
                  onClick={() => goTo(4)}
                  className="text-sm font-medium text-gray-500 hover:text-gray-700"
                >
                  Skip transcript
                </button>
              </div>
            </div>
          </div>

          {/* Step 4: Block out times */}
          <div
            className={`absolute inset-0 flex flex-col p-6 transition-all duration-400 ease-out ${slideClass(4)} ${
              step !== 4 ? "pointer-events-none" : ""
            }`}
          >
            <div className="mb-1 flex items-center gap-3">
              <button
                type="button"
                onClick={() => goTo(3)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                aria-label="Go back"
              >
                <svg
                  className="h-5 w-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M15 19l-7-7 7-7"
                  />
                </svg>
              </button>
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[#DAAA00]">
                  Step 4 of 4
                </p>
                <h2 className="text-lg font-bold text-gray-900">
                  Block out times (optional)
                </h2>
              </div>
            </div>

            <p className="mb-3 pl-11 text-sm text-gray-500">
              Click &amp; drag on a day column to block out busy times. Name each block after creating it.
            </p>

            <div className="flex min-h-0 flex-1 flex-col gap-2 px-4">
              <div className="overflow-y-auto rounded-2xl border border-gray-200 bg-gray-50" style={{ maxHeight: "340px" }}>
                <div className="flex gap-0 p-2">
                  <div className="flex w-10 shrink-0 flex-col pt-6 text-right text-[10px] text-gray-400">
                    {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => {
                      const hour = START_HOUR + i;
                      const label = `${hour <= 12 ? hour : hour - 12}${hour < 12 ? "am" : "pm"}`;
                      return (
                        <div key={hour} style={{ height: `${100 / (END_HOUR - START_HOUR)}%`, minHeight: "1.75rem" }} className="flex items-start justify-end pr-1.5">
                          <span className="-mt-1.5">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex min-w-0 flex-1 gap-1">
                    {DAYS.map((day, dayIdx) => (
                      <div
                        key={day}
                        className="relative flex-1 rounded-lg border border-gray-200 bg-white"
                        onMouseDown={(e) => {
                          if (e.button !== 0) return;
                          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                          const startMinutes = getMinutesFromPointer(e.clientY, rect, true);
                          setDragging({
                            dayIdx,
                            startMinutes,
                            currentMinutes: startMinutes,
                            rect,
                          });
                        }}
                        onMouseMove={(e) => {
                          if (!dragging || dragging.dayIdx !== dayIdx) return;
                          const rect = dragging.rect;
                          const currentMinutes = getMinutesFromPointer(e.clientY, rect, true);
                          setDragging((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  currentMinutes,
                                }
                              : prev
                          );
                        }}
                        onMouseUp={(e) => {
                          if (!dragging || dragging.dayIdx !== dayIdx) return;
                          const rect = dragging.rect;
                          const endMinutes = getMinutesFromPointer(e.clientY, rect, true);
                          const start = Math.min(dragging.startMinutes, endMinutes);
                          const end = Math.max(dragging.startMinutes, endMinutes);
                          if (end <= start) {
                            setDragging(null);
                            return;
                          }
                          const newBlock: TimeBlock = {
                            id: `${Date.now().toString(36)}-${Math.random()
                              .toString(36)
                              .slice(2, 8)}`,
                            label: "Busy",
                            color: BLOCK_COLORS[0].bg,
                            days: [DAYS[dayIdx]],
                            startTime: minutesToTime(start),
                            endTime: minutesToTime(end),
                          };
                          setTimeBlocks((prev) => [...prev, newBlock]);
                          setEditingBlockId(newBlock.id);
                          setEditingLabel(newBlock.label || "");
                          setDragging(null);
                        }}
                        onMouseLeave={(e) => {
                          if (!dragging || dragging.dayIdx !== dayIdx) return;
                          const rect = dragging.rect;
                          const currentMinutes = getMinutesFromPointer(e.clientY, rect, true);
                          setDragging((prev) =>
                            prev
                              ? {
                                  ...prev,
                                  currentMinutes,
                                }
                              : prev
                          );
                        }}
                      >
                        <div className="border-b border-gray-100 bg-gray-50/80 py-1 text-center text-[11px] font-semibold text-gray-600">
                          {day}
                        </div>
                        <div className="relative" style={{ height: "21rem" }}>
                          {Array.from({ length: END_HOUR - START_HOUR }, (_, i) => (
                            <div
                              key={i}
                              className="absolute left-0 right-0 border-b border-dashed border-gray-100"
                              style={{
                                top: `${(i / (END_HOUR - START_HOUR)) * 100}%`,
                              }}
                            />
                          ))}

                          {timeBlocks
                            .filter((b) => b.days.includes(day))
                            .map((b) => {
                              const { top, height } = getBlockPosition(b.startTime, b.endTime);
                              if (height <= 0) return null;
                              const isEditing = editingBlockId === b.id;
                              return (
                                <div
                                  key={b.id}
                                  className="absolute left-1 right-1 rounded-md border text-[10px] leading-tight shadow-md transition-all z-20"
                                  style={{ 
                                    top: `${top}%`, 
                                    height: `${height}%`,
                                    backgroundColor: b.color || BLOCK_COLORS[0].bg,
                                    borderColor: BLOCK_COLORS.find(c => c.bg === b.color)?.border || "#6366F1",
                                    color: BLOCK_COLORS.find(c => c.bg === b.color)?.text || "#1E1B4B"
                                  }}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                  }}
                                  onClick={() => {
                                    setEditingBlockId(b.id);
                                    setEditingLabel(b.label || "");
                                  }}
                                >
                                  <div className="flex h-full flex-col justify-between p-1">
                                    <div className="flex items-start justify-between gap-1 overflow-hidden">
                                      <span className="truncate font-bold">
                                        {b.label || "Busy"}
                                      </span>
                                      {isEditing && (
                                        <div 
                                          className="fixed inset-0 z-30" 
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingBlockId(null);
                                          }}
                                        />
                                      )}
                                      <div className={`relative ${isEditing ? "z-40" : ""}`}>
                                      {isEditing ? (
                                        <div 
                                          className="absolute right-0 top-0 w-64 rounded-2xl border border-gray-200 bg-white p-4 shadow-2xl dark:border-slate-700 dark:bg-slate-800"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          <div className="space-y-4">
                                            <div>
                                              <label className="mb-1 block text-[10px] font-bold uppercase text-gray-400">Label</label>
                                              <input
                                                value={editingLabel}
                                                autoFocus
                                                onChange={(e) => setEditingLabel(e.target.value)}
                                                onBlur={() => {
                                                  setTimeBlocks((prev) =>
                                                    prev.map((tb) =>
                                                      tb.id === b.id
                                                        ? { ...tb, label: editingLabel || "Busy" }
                                                        : tb
                                                    )
                                                  );
                                                }}
                                                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 outline-none focus:border-[#002855] focus:bg-white"
                                              />
                                            </div>

                                            <div className="grid grid-cols-2 gap-3">
                                              <div>
                                                <label className="mb-1 block text-[10px] font-bold uppercase text-gray-400">Start</label>
                                                <input
                                                  type="time"
                                                  value={b.startTime}
                                                  onChange={(e) => {
                                                    const val = e.target.value;
                                                    setTimeBlocks(prev => prev.map(tb => tb.id === b.id ? { ...tb, startTime: val } : tb));
                                                  }}
                                                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-[#002855]"
                                                />
                                              </div>
                                              <div>
                                                <label className="mb-1 block text-[10px] font-bold uppercase text-gray-400">End</label>
                                                <input
                                                  type="time"
                                                  value={b.endTime}
                                                  onChange={(e) => {
                                                    const val = e.target.value;
                                                    setTimeBlocks(prev => prev.map(tb => tb.id === b.id ? { ...tb, endTime: val } : tb));
                                                  }}
                                                  className="w-full rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5 text-xs text-gray-800 outline-none focus:border-[#002855]"
                                                />
                                              </div>
                                            </div>

                                            <div>
                                              <label className="mb-2 block text-[10px] font-bold uppercase text-gray-400">Color</label>
                                              <div className="flex flex-wrap gap-2">
                                                {BLOCK_COLORS.map((c) => (
                                                  <button
                                                    key={c.bg}
                                                    type="button"
                                                    onClick={() => {
                                                      setTimeBlocks(prev => prev.map(tb => tb.id === b.id ? { ...tb, color: c.bg } : tb));
                                                    }}
                                                    style={{ backgroundColor: c.bg, borderColor: c.border }}
                                                    className={`h-6 w-6 rounded-full border-2 transition-transform hover:scale-110 ${
                                                      b.color === c.bg ? "ring-2 ring-[#002855] ring-offset-1" : ""
                                                    }`}
                                                    title={c.label}
                                                  />
                                                ))}
                                              </div>
                                            </div>

                                            <button
                                              type="button"
                                              onClick={() => setEditingBlockId(null)}
                                              className="w-full rounded-xl bg-[#002855] py-2 text-xs font-bold text-white shadow-sm hover:bg-[#001a3a]"
                                            >
                                              Done
                                            </button>
                                          </div>
                                        </div>
                                      ) : null}
                                      </div>
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setTimeBlocks((prev) =>
                                            prev.filter((tb) => tb.id !== b.id)
                                          );
                                          if (editingBlockId === b.id) {
                                            setEditingBlockId(null);
                                          }
                                        }}
                                        className="ml-1 rounded bg-white/70 px-1 text-[9px] text-gray-500 hover:bg-white hover:text-gray-700"
                                        aria-label="Delete block"
                                      >
                                        ×
                                      </button>
                                    </div>
                                    <span className="text-[9px] text-gray-600">
                                      {formatDisplayTime(
                                        parseTimeToMinutesLocal(b.startTime)
                                      )}
                                      {" – "}
                                      {formatDisplayTime(
                                        parseTimeToMinutesLocal(b.endTime)
                                      )}
                                    </span>
                                  </div>
                                </div>
                              );
                            })}

                          {dragging && dragging.dayIdx === dayIdx && (() => {
                            const start = Math.min(
                              dragging.startMinutes,
                              dragging.currentMinutes
                            );
                            const end = Math.max(
                              dragging.startMinutes,
                              dragging.currentMinutes
                            );
                            if (end <= start) return null;
                            const { top, height } = getBlockPosition(
                              minutesToTime(start),
                              minutesToTime(end)
                            );
                            return (
                              <div
                                className="pointer-events-none absolute left-1 right-1 rounded-md border-2 border-dashed border-[#002855]/60 bg-[#002855]/10"
                                style={{ top: `${top}%`, height: `${height}%` }}
                              />
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {timeBlocks.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {timeBlocks.map((b) => (
                    <span
                      key={b.id}
                      className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-700 shadow-sm"
                    >
                      <span className="font-semibold">{b.label || "Busy"}</span>
                      <span className="text-gray-400">
                        {b.days.join(", ")}{" "}
                        {formatDisplayTime(parseTimeToMinutesLocal(b.startTime))}
                        –
                        {formatDisplayTime(parseTimeToMinutesLocal(b.endTime))}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setTimeBlocks((prev) =>
                            prev.filter((tb) => tb.id !== b.id)
                          )
                        }
                        className="ml-0.5 rounded-full text-gray-400 hover:text-gray-700"
                        aria-label="Remove block"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    saveTimeBlocks(BLOCKS_STORAGE_KEY, timeBlocks);
                    handleFinish();
                  }}
                  className="rounded-xl bg-[#002855] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#001a3a]"
                >
                  Finish
                </button>
                {timeBlocks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setTimeBlocks([]);
                      setEditingBlockId(null);
                      setEditingLabel("");
                    }}
                    className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-700"
                  >
                    Clear all
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    saveTimeBlocks(BLOCKS_STORAGE_KEY, []);
                    handleFinish();
                  }}
                  className="text-xs font-medium text-gray-400 hover:text-gray-600"
                >
                  Skip
                </button>
                <span className="ml-auto text-[11px] text-gray-400">
                  {timeBlocks.length} block{timeBlocks.length === 1 ? "" : "s"}
                </span>
              </div>
            </div>
          </div>

          {/* Step 5: Done */}
          <div
            className={`absolute inset-0 flex flex-col items-center justify-center p-8 transition-all duration-400 ease-out ${slideClass(5)} ${
              step !== 5 ? "pointer-events-none" : ""
            }`}
          >
            <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
              <svg
                className="h-8 w-8 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2.5}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold text-gray-900">
              You&apos;re all set!
            </h2>
            <p className="mt-2 max-w-xs text-center text-sm text-gray-500">
              {context.major
                ? `${context.major} • ${context.year || "Year not set"}`
                : "Profile ready"}
            </p>
            {parsedCodes.length > 0 && (
              <p className="mt-1 max-w-xs text-center text-xs text-gray-400">
                We also pre-filled{" "}
                <span className="font-semibold">
                  {parsedCodes.length} completed course
                  {parsedCodes.length > 1 ? "s" : ""}
                </span>{" "}
                from your transcript.
              </p>
            )}
            <p className="mt-1 text-xs text-gray-400">
              You can edit this anytime from the profile panel.
            </p>
            <button
              type="button"
              onClick={handleFinish}
              className="mt-6 rounded-xl bg-[#002855] px-8 py-3 text-sm font-semibold text-white shadow-lg transition-all hover:bg-[#001a3a] hover:shadow-xl active:scale-[0.98]"
            >
              Start Exploring
            </button>
          </div>
        </div>

        {/* Skip link */}
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={handleFinish}
            className="text-xs font-medium text-white/60 transition-colors hover:text-white/90"
          >
            Skip setup for now
          </button>
        </div>
      </div>
    </div>
  );
}
