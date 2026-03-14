"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { StudentContext, Section } from "@/lib/course-data";
import { subscribeScheduleAdd } from "@/lib/schedule-store";
import { TimeBlock, Weekday, blocksToIntervalsByDay, intervalsOverlap, loadTimeBlocks, BLOCK_COLORS, snapTo15Minutes, saveTimeBlocks, parseTimeToMinutes } from "@/lib/time-blocks";
import { ScheduleSearchModal } from "./schedule-search-modal";
import { AutoGenerateModal } from "./auto-generate-modal";
import { checkScheduleHealth } from "@/lib/schedule-utils";
import { ScheduleHealthBanner } from "../schedule-health-banner";

interface SchedulePlannerTabProps {
  studentContext: StudentContext;
}

const TERM = "Spring Quarter 2026";
const STORAGE_KEY = "ucd-ai-schedule-spring-2026";
const BLOCKS_STORAGE_KEY = "ucd-ai-blocked-times-spring-2026";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
const DAY_CODES: Record<string, string> = {
  M: "Mon",
  T: "Tue",
  W: "Wed",
  R: "Thu",
  F: "Fri",
};

const START_HOUR = 8;
const END_HOUR = 22;
const GRID_ROWS = END_HOUR - START_HOUR;
const GRID_MIN_HEIGHT_REM = GRID_ROWS * 3;
const GRID_HEIGHT_REM = GRID_ROWS * 3;

function formatDisplayTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const hour12 = ((h + 11) % 12) + 1;
  const suffix = h < 12 ? "am" : "pm";
  return `${hour12}:${m.toString().padStart(2, "0")}${suffix}`;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function sectionHasMeetingTimes(section: Section): boolean {
  const m = section.meetings?.[0];
  return !!(m?.days?.length && m?.startTime && m?.endTime);
}

interface PlannedSection extends Section {
  color: string;
}


function getBlockedOverlaysByDay(blocks: TimeBlock[]) {
  const totalMinutes = (END_HOUR - START_HOUR) * 60;
  const overlays: Record<string, (TimeBlock & { top: number; height: number })[]> = {};
  for (const d of DAYS) overlays[d] = [];

  for (const b of blocks) {
    const start = parseTimeToMinutes(b.startTime);
    const end = parseTimeToMinutes(b.endTime);
    const clampedStart = Math.max(start, START_HOUR * 60);
    const clampedEnd = Math.min(end, END_HOUR * 60);
    if (clampedEnd <= clampedStart) continue;

    const minutesFromStart = clampedStart - START_HOUR * 60;
    const duration = clampedEnd - clampedStart;
    const top = (minutesFromStart / totalMinutes) * 100;
    const height = (duration / totalMinutes) * 100;

    for (const day of b.days) {
      if (!overlays[day]) overlays[day] = [];
      overlays[day].push({ ...b, top, height });
    }
  }

  return overlays;
}

function detectBlockedTimeOverlaps(sections: PlannedSection[], blocks: TimeBlock[]): Set<string> {
  const overlaps = new Set<string>();
  if (blocks.length === 0 || sections.length === 0) return overlaps;
  const byDay = blocksToIntervalsByDay(blocks);

  for (const s of sections) {
    for (const m of s.meetings) {
      const meetingStart = parseTimeToMinutes(m.startTime);
      const meetingEnd = parseTimeToMinutes(m.endTime);
      if (!Number.isFinite(meetingStart) || !Number.isFinite(meetingEnd)) continue;
      for (const dayCode of m.days) {
        const day = DAY_CODES[dayCode] as Weekday | undefined;
        if (!day) continue;
        const dayIntervals = byDay[day] ?? [];
        for (const b of dayIntervals) {
          if (intervalsOverlap(meetingStart, meetingEnd, b.start, b.end)) {
            overlaps.add(s.crn);
            break;
          }
        }
      }
    }
  }

  return overlaps;
}

function getMeetingBlocks(section: PlannedSection) {
  const blocks: {
    day: string;
    top: number;
    height: number;
    label: string;
    isConflict: boolean;
  }[] = [];

  for (const meeting of section.meetings) {
    for (const dayCode of meeting.days) {
      const day = DAY_CODES[dayCode] ?? "";
      if (!day) continue;

      const start = parseTimeToMinutes(meeting.startTime);
      const end = parseTimeToMinutes(meeting.endTime);
      const clampedStart = Math.max(start, START_HOUR * 60);
      const clampedEnd = Math.min(end || clampedStart + 50, END_HOUR * 60);
      const totalMinutes = (END_HOUR - START_HOUR) * 60;

      const minutesFromStart = clampedStart - START_HOUR * 60;
      const duration = Math.max(clampedEnd - clampedStart, 40);

      const top = (minutesFromStart / totalMinutes) * 100;
      const height = (duration / totalMinutes) * 100;

      blocks.push({
        day,
        top,
        height,
        label: `${section.courseCode} ${section.section || ""}`.trim(),
        isConflict: false,
      });
    }
  }

  return blocks;
}

function detectConflicts(sections: PlannedSection[]): Set<string> {
  const conflicts = new Set<string>();

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const a = sections[i];
      const b = sections[j];

      for (const ma of a.meetings) {
        for (const mb of b.meetings) {
          const sharedDays = ma.days.filter((d) => mb.days.includes(d));
          if (sharedDays.length === 0) continue;

          const aStart = parseTimeToMinutes(ma.startTime);
          const aEnd = parseTimeToMinutes(ma.endTime);
          const bStart = parseTimeToMinutes(mb.startTime);
          const bEnd = parseTimeToMinutes(mb.endTime);

          if (aEnd <= bStart || bEnd <= aStart) continue;

          conflicts.add(a.crn);
          conflicts.add(b.crn);
        }
      }
    }
  }

  return conflicts;
}

const COLORS = [
  "#C7D2FE",
  "#FDE68A",
  "#BBF7D0",
  "#F9A8D4",
  "#A5F3FC",
  "#FECACA",
];

export function SchedulePlannerTab({ studentContext }: SchedulePlannerTabProps) {
  const [query, setQuery] = useState("");
  const [subject, setSubject] = useState("");
  const [openOnly, setOpenOnly] = useState(false);
  const [planned, setPlanned] = useState<PlannedSection[]>([]);
  const [subjects, setSubjects] = useState<string[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);
  const [swapFrom, setSwapFrom] = useState<PlannedSection | null>(null);
  const [blocked, setBlocked] = useState<TimeBlock[]>([]);
  const [autoGenOpen, setAutoGenOpen] = useState(false);
  const [copiedCrns, setCopiedCrns] = useState(false);
  
  const [dragging, setDragging] = useState<{
    day: string;
    startMinutes: number;
    currentMinutes: number;
    rect: DOMRect;
  } | null>(null);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingLabel, setEditingLabel] = useState("");

  const getMinutesFromPointer = useCallback((clientY: number, rect: DOMRect, snap: boolean = false) => {
    const totalMinutes = (END_HOUR - START_HOUR) * 60;
    const offset = Math.min(Math.max(clientY - rect.top, 0), rect.height);
    const ratio = rect.height === 0 ? 0 : offset / rect.height;
    let minutesFromStart = Math.round(ratio * totalMinutes);
    if (snap) minutesFromStart = snapTo15Minutes(minutesFromStart);
    return START_HOUR * 60 + minutesFromStart;
  }, []);

  useEffect(() => {
    try {
      const raw =
        typeof window !== "undefined"
          ? window.localStorage.getItem(STORAGE_KEY)
          : null;
      if (raw) {
        const parsed = JSON.parse(raw) as PlannedSection[];
        setPlanned(parsed);
      }
    } catch {
    }
  }, []);

  useEffect(() => {
    setBlocked(loadTimeBlocks(BLOCKS_STORAGE_KEY));
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/sections/subjects")
      .then((res) => res.json())
      .then((data: { subjects?: string[] }) => {
        if (!cancelled && Array.isArray(data.subjects)) setSubjects(data.subjects);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(planned));
    } catch {
    }
  }, [planned]);

  const health = useMemo(
    () => checkScheduleHealth(planned, blocked, studentContext.completedCourses),
    [planned, blocked, studentContext.completedCourses]
  );

  const blockedOverlaysByDay = useMemo(
    () => getBlockedOverlaysByDay(blocked),
    [blocked]
  );

  const plannedCrns = useMemo(
    () => new Set(planned.map((p) => p.crn)),
    [planned]
  );

  const handleAdd = useCallback((section: Section) => {
    setPlanned((prev) => {
      if (prev.some((p) => p.crn === section.crn)) return prev;
      const color = COLORS[prev.length % COLORS.length];
      return [...prev, { ...section, color }];
    });
  }, []);

  // Listen for "add to schedule" events dispatched from AI chat course cards
  useEffect(() => {
    return subscribeScheduleAdd(handleAdd);
  }, [handleAdd]);

  const handleRemove = (crn: string) => {
    setPlanned((prev) => prev.filter((p) => p.crn !== crn));
  };

  const handleSwapPick = useCallback((to: Section) => {
    setPlanned((prev) => {
      if (!swapFrom) return prev;
      if (swapFrom.crn === to.crn) return prev;
      if (prev.some((p) => p.crn === to.crn)) return prev;

      return prev.map((p) =>
        p.crn === swapFrom.crn ? ({ ...to, color: p.color } as PlannedSection) : p
      );
    });
    setSwapOpen(false);
    setSwapFrom(null);
  }, [swapFrom]);

  const blocksByDay = useMemo(() => {
    const map: Record<string, ReturnType<typeof getMeetingBlocks>> = {};
    for (const day of DAYS) map[day] = [];
    for (const section of planned) {
      const blocks = getMeetingBlocks(section);
      for (const b of blocks) {
        if (!map[b.day]) map[b.day] = [];
        map[b.day].push(b);
      }
    }
    return map;
  }, [planned]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ScheduleSearchModal
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        initialQuery={query}
        initialSubject={subject}
        initialOpenOnly={openOnly}
        onAddSection={handleAdd}
        plannedCrns={plannedCrns}
        completedCourses={studentContext.completedCourses}
      />
      <ScheduleSearchModal
        open={swapOpen}
        onClose={() => {
          setSwapOpen(false);
          setSwapFrom(null);
        }}
        initialQuery={swapFrom?.courseCode ?? ""}
        initialSubject={swapFrom?.subject ?? ""}
        initialOpenOnly={openOnly}
        plannedCrns={plannedCrns}
        completedCourses={studentContext.completedCourses}
        mode="swap"
        swapCourseFilter={
          swapFrom
            ? {
                subject: swapFrom.subject,
                courseNumber: swapFrom.courseNumber,
                courseCode: swapFrom.courseCode,
                fromCrn: swapFrom.crn,
              }
            : undefined
        }
        onPickSection={handleSwapPick}
      />

      <AutoGenerateModal
        open={autoGenOpen}
        onClose={() => setAutoGenOpen(false)}
        onApply={(sections) => {
          for (const s of sections) handleAdd(s);
        }}
        studentContext={{ ...studentContext, blockedTimes: blocked }}
      />

      <div className="border-b border-gray-100 dark:border-slate-700 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Schedule Planner
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">
              Search sections and build your Spring 2026 weekly schedule.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {planned.length > 0 && (
              <button
                onClick={() => {
                  const crns = planned.map(p => p.crn).join(", ");
                  navigator.clipboard.writeText(crns).then(() => {
                    setCopiedCrns(true);
                    setTimeout(() => setCopiedCrns(false), 2000);
                  });
                }}
                className="rounded-lg border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-all"
              >
                {copiedCrns ? "✓ Copied!" : "Copy CRNs"}
              </button>
            )}
            <button
              onClick={() => setAutoGenOpen(true)}
              className="rounded-lg bg-gradient-to-r from-[#002855] to-[#003d7a] px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:shadow-md transition-all"
            >
              <svg className="h-4 w-4 mr-1.5 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
              Auto-Generate
            </button>
            <span className="rounded-full bg-[#002855]/8 dark:bg-[#DAAA00]/15 px-2.5 py-1 text-xs font-medium text-[#002855] dark:text-[#DAAA00]">
              {TERM}
            </span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-4 p-4">
        <div className="flex w-80 min-w-[18rem] flex-col rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800/50">
          <div className="border-b border-gray-100 dark:border-slate-700 px-4 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
              Add courses
            </p>
            <p className="mt-0.5 text-xs text-gray-500">
              Search by course code, title, or instructor.
            </p>
          </div>

          <div className="px-4 py-3 space-y-3">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setSearchOpen(true);
              }}
              className="flex flex-col gap-2"
            >
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="e.g. MAT 021B, Psychology, or Smith"
                  className="flex-1 rounded-lg border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-gray-900 dark:text-white placeholder:text-gray-400 dark:placeholder:text-slate-500 outline-none focus:border-[#002855] focus:ring-2 focus:ring-[#002855]/20"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-[#002855] px-3 py-2 text-xs font-medium text-white hover:bg-[#001a3a] disabled:opacity-50"
                >
                  Search
                </button>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-gray-500 dark:text-slate-400 shrink-0">Subject</label>
                <select
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="rounded-lg border border-gray-300 dark:border-slate-600 px-2 py-1.5 text-xs text-gray-900 dark:text-white outline-none focus:border-[#002855] bg-white dark:bg-slate-800 min-w-[5rem]"
                >
                  <option value="">All subjects</option>
                  {subjects.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={openOnly}
                  onChange={(e) => setOpenOnly(e.target.checked)}
                  className="h-3.5 w-3.5 rounded border-gray-300 text-[#002855] accent-[#002855]"
                />
                Show open sections only
              </label>
            </form>

            <div className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 px-3 py-2 text-xs text-gray-600 dark:text-slate-300">
              <span className="font-medium text-gray-700 dark:text-slate-200">
                {planned.length}
              </span>{" "}
              section{planned.length === 1 ? "" : "s"} in schedule.
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="ml-2 rounded-md bg-white dark:bg-slate-700 px-2 py-1 text-[11px] font-medium text-[#002855] dark:text-[#DAAA00] shadow-sm hover:bg-[#002855]/5 dark:hover:bg-slate-600"
              >
                Browse / search
              </button>
            </div>

            {/* Schedule Score Card */}
            {planned.length > 0 && (() => {
              const totalUnits = planned.reduce((sum, s) => {
                const u = typeof s.units === "string" ? parseInt(s.units) || 0 : (Number(s.units) || 0);
                return sum + u;
              }, 0);
              // rmp is Record<string, {avgRating, avgDifficulty, ...}> — grab first instructor's data
              const getRmpData = (s: PlannedSection) => {
                if (!s.rmp) return null;
                const vals = Object.values(s.rmp);
                return vals.length > 0 ? vals[0] : null;
              };
              const rmpSections = planned.filter(s => getRmpData(s)?.avgRating);
              const avgRmp = rmpSections.length > 0
                ? rmpSections.reduce((sum, s) => sum + (getRmpData(s)?.avgRating || 0), 0) / rmpSections.length
                : 0;
              const gpaSections = planned.filter(s => getRmpData(s)?.grades?.avgGpa);
              const avgGpa = gpaSections.length > 0
                ? gpaSections.reduce((sum, s) => sum + (getRmpData(s)?.grades?.avgGpa || 0), 0) / gpaSections.length
                : 0;
              const gpaColor = avgGpa >= 3.3 ? "text-green-500" : avgGpa >= 2.7 ? "text-yellow-500" : "text-red-500";
              const rmpColor = avgRmp >= 4.0 ? "text-green-500" : avgRmp >= 3.0 ? "text-yellow-500" : "text-gray-600";

              return (
                <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-600 dark:text-slate-400 mb-2">Schedule Score</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-[#002855] dark:text-blue-400">{totalUnits}</p>
                      <p className="text-[10px] text-gray-600">units</p>
                    </div>
                    <div>
                      <p className={`text-lg font-bold ${avgGpa > 0 ? gpaColor : "text-gray-300 dark:text-slate-600"}`}>
                        {avgGpa > 0 ? avgGpa.toFixed(2) : "–"}
                      </p>
                      <p className="text-[10px] text-gray-600">avg GPA</p>
                    </div>
                    <div>
                      <p className={`text-lg font-bold ${avgRmp > 0 ? rmpColor : "text-gray-300 dark:text-slate-600"}`}>
                        {avgRmp > 0 ? avgRmp.toFixed(1) : "–"}
                      </p>
                      <p className="text-[10px] text-gray-600">avg RMP</p>
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3 scrollbar-thin">
            {planned.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[#002855]/5 dark:bg-blue-500/10">
                  <svg className="h-8 w-8 text-[#002855]/40 dark:text-blue-400/40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
                  </svg>
                </div>
                <p className="text-sm font-semibold text-gray-700 dark:text-slate-200 mb-1">
                  No courses yet
                </p>
                <p className="text-xs text-gray-600 dark:text-slate-400 mb-4">
                  Start building your {TERM} schedule
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSearchOpen(true)}
                    className="rounded-lg bg-[#002855] px-3 py-2 text-xs font-medium text-white hover:bg-[#001a3a] transition-all"
                  >
                    Browse Courses
                  </button>
                  <button
                    onClick={() => setAutoGenOpen(true)}
                    className="rounded-lg border border-gray-200 dark:border-slate-700 px-3 py-2 text-xs font-medium text-gray-600 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-all"
                  >
                    Auto-Generate
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {planned.map((s) => (
                  <div
                    key={s.crn}
                    className="rounded-lg border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 px-3 py-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-900">
                          {s.courseCode} {s.section ? `(${s.section})` : ""}
                        </p>
                        <p className="text-[11px] text-gray-500 truncate">
                          {s.title}
                        </p>
                        <p className="mt-1 text-[11px] text-gray-500">
                          {sectionHasMeetingTimes(s) ? (
                            <>
                              {s.meetings?.[0]?.days?.join("")}{" "}
                              {s.meetings?.[0]?.startTime}–
                              {s.meetings?.[0]?.endTime}
                            </>
                          ) : (
                            "Time TBA"
                          )}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemove(s.crn)}
                        className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-gray-600 shadow-sm hover:bg-gray-100"
                      >
                        Remove
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSwapFrom(s);
                          setSwapOpen(true);
                        }}
                        className="rounded-md bg-white px-2 py-1 text-[11px] font-medium text-[#002855] shadow-sm hover:bg-[#002855]/5"
                      >
                        Swap
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-slate-500">
                Weekly view
              </p>
            </div>
          </div>

          {health.conflicts.length > 0 && (
            <div className="px-4 py-2 border-b border-gray-100 dark:border-slate-800 bg-gray-50/30 dark:bg-slate-900/30">
              <ScheduleHealthBanner health={health} />
            </div>
          )}

          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div
              className="flex w-12 flex-col border-r border-gray-100 dark:border-slate-800 bg-gray-50 dark:bg-slate-900/50 text-right text-[10px] text-gray-400 dark:text-slate-500"
            >
              {/* Header Spacer */}
              <div className="h-8 border-b border-gray-100 dark:border-slate-800" />
              
              {Array.from(
                { length: END_HOUR - START_HOUR },
                (_, i) => START_HOUR + i
              ).map((h) => (
                <div key={h} className="flex-1 pr-1 pt-1 border-b border-gray-100/5 last:border-b-0">
                  {h <= 12 ? h : h - 12}
                  {h < 12 ? "am" : "pm"}
                </div>
              ))}
            </div>

            <div className="flex min-h-0 flex-1">
              {DAYS.map((day) => (
                <div
                  key={day}
                  className="flex flex-1 flex-col border-r border-gray-100 dark:border-slate-800 last:border-r-0"
                >
                  <div className="flex h-8 items-center justify-center border-b border-gray-100 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 text-center text-[11px] font-medium text-gray-600 dark:text-slate-300 backdrop-blur">
                    {day}
                  </div>
                  <div
                    className="relative flex flex-1 flex-col"
                    onMouseDown={(e) => {
                      if (e.button !== 0) return;
                      const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                      const minutes = getMinutesFromPointer(e.clientY, rect, true);
                      setDragging({
                        day,
                        startMinutes: minutes,
                        currentMinutes: minutes,
                        rect,
                      });
                    }}
                    onMouseMove={(e) => {
                      if (!dragging || dragging.day !== day) return;
                      const minutes = getMinutesFromPointer(e.clientY, dragging.rect, true);
                      setDragging(prev => prev ? { ...prev, currentMinutes: minutes } : null);
                    }}
                    onMouseUp={(e) => {
                      if (!dragging || dragging.day !== day) return;
                      const minutes = getMinutesFromPointer(e.clientY, dragging.rect, true);
                      const start = Math.min(dragging.startMinutes, minutes);
                      const end = Math.max(dragging.startMinutes, minutes);
                      if (end > start) {
                        const newBlock: TimeBlock = {
                          id: Math.random().toString(36).slice(2, 9),
                          label: "Busy",
                          color: BLOCK_COLORS[0].bg,
                          days: [day as Weekday],
                          startTime: minutesToTime(start),
                          endTime: minutesToTime(end),
                        };
                        const next = [...blocked, newBlock];
                        setBlocked(next);
                        saveTimeBlocks(BLOCKS_STORAGE_KEY, next);
                        setEditingBlockId(newBlock.id);
                        setEditingLabel(newBlock.label || "");
                      }
                      setDragging(null);
                    }}
                  >
                    <div className="absolute inset-0 flex flex-col pointer-events-none">
                      {Array.from(
                        { length: END_HOUR - START_HOUR },
                        (_, i) => i
                      ).map((i) => (
                        <div
                          key={i}
                          className="flex-1 border-b border-dashed border-gray-100 dark:border-slate-800/50"
                        />
                      ))}
                    </div>

                    {blockedOverlaysByDay[day]?.map((b) => {
                      const isEditing = editingBlockId === b.id;
                      return (
                        <div
                          key={`blocked-${day}-${b.id}`}
                          className="absolute left-0.5 right-0.5 rounded-md border text-[10px] leading-tight shadow-md transition-all z-20 cursor-pointer"
                          style={{ 
                            top: `${b.top}%`, 
                            height: `${b.height}%`,
                            backgroundColor: b.color || BLOCK_COLORS[0].bg,
                            borderColor: BLOCK_COLORS.find(c => c.bg === b.color)?.border || "#6366F1",
                            color: BLOCK_COLORS.find(c => c.bg === b.color)?.text || "#1E1B4B"
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingBlockId(b.id);
                            setEditingLabel(b.label || "");
                          }}
                        >
                          <div className="flex h-full flex-col justify-between p-1.5 overflow-hidden">
                            <span className="truncate text-[10px] font-bold leading-tight">{b.label || "Busy"}</span>
                            <span className="text-[9px] opacity-70">
                              {formatDisplayTime(parseTimeToMinutes(b.startTime))}
                            </span>
                          </div>
                        </div>
                      );
                    })}

                    {/* Centered Modal for Editing Block */}
                    {editingBlockId && (() => {
                      const b = blocked.find(tb => tb.id === editingBlockId);
                      if (!b) return null;
                      return (
                        <>
                          <div 
                            className="fixed inset-0 z-[100] bg-slate-950/20 backdrop-blur-[2px] transition-all" 
                            onClick={() => setEditingBlockId(null)}
                          />
                          <div className="fixed left-1/2 top-1/2 z-[101] w-[320px] -translate-x-1/2 -translate-y-1/2 animate-in fade-in zoom-in duration-200">
                            <div 
                              className="overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="bg-[#002855] px-5 py-4 text-white">
                                <h3 className="text-sm font-bold">Edit Busy Time</h3>
                                <p className="text-[10px] text-white/60 font-medium uppercase tracking-wider">Schedule Constraint</p>
                              </div>
                              
                              <div className="p-5 space-y-5">
                                <div>
                                  <label className="mb-1.5 block text-[10px] font-bold uppercase text-gray-600">Activity Label</label>
                                  <input
                                    value={editingLabel}
                                    autoFocus
                                    onChange={(e) => setEditingLabel(e.target.value)}
                                    onBlur={() => {
                                      const next = blocked.map(tb => tb.id === b.id ? { ...tb, label: editingLabel || "Busy" } : tb);
                                      setBlocked(next);
                                      saveTimeBlocks(BLOCKS_STORAGE_KEY, next);
                                    }}
                                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none focus:border-[#002855] focus:ring-4 focus:ring-[#002855]/10 transition-all font-medium placeholder:text-gray-400"
                                    placeholder="e.g. Work, Gym, Study"
                                  />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                  <div>
                                    <label className="mb-1.5 block text-[10px] font-bold uppercase text-gray-600">Start Time</label>
                                    <input
                                      type="time"
                                      value={b.startTime}
                                      onChange={(e) => {
                                        const next = blocked.map(tb => tb.id === b.id ? { ...tb, startTime: e.target.value } : tb);
                                        setBlocked(next);
                                        saveTimeBlocks(BLOCKS_STORAGE_KEY, next);
                                      }}
                                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white font-medium"
                                    />
                                  </div>
                                  <div>
                                    <label className="mb-1.5 block text-[10px] font-bold uppercase text-gray-600">End Time</label>
                                    <input
                                      type="time"
                                      value={b.endTime}
                                      onChange={(e) => {
                                        const next = blocked.map(tb => tb.id === b.id ? { ...tb, endTime: e.target.value } : tb);
                                        setBlocked(next);
                                        saveTimeBlocks(BLOCKS_STORAGE_KEY, next);
                                      }}
                                      className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900 dark:bg-slate-800 dark:border-slate-700 dark:text-white font-medium"
                                    />
                                  </div>
                                </div>

                                <div>
                                  <label className="mb-2.5 block text-[10px] font-bold uppercase text-gray-600">Block Color</label>
                                  <div className="flex flex-wrap gap-2.5">
                                    {BLOCK_COLORS.map((c) => (
                                      <button
                                        key={c.bg}
                                        type="button"
                                        onClick={() => {
                                          const next = blocked.map(tb => tb.id === b.id ? { ...tb, color: c.bg } : tb);
                                          setBlocked(next);
                                          saveTimeBlocks(BLOCKS_STORAGE_KEY, next);
                                        }}
                                        style={{ backgroundColor: c.bg, borderColor: c.border }}
                                        className={`h-7 w-7 rounded-full border-2 transition-all hover:scale-110 active:scale-95 ${
                                          b.color === c.bg ? "ring-2 ring-[#002855] ring-offset-2 scale-110" : "opacity-80 hover:opacity-100"
                                        }`}
                                        title={c.label}
                                      />
                                    ))}
                                  </div>
                                </div>

                                <div className="flex gap-3 pt-2">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const next = blocked.filter(tb => tb.id !== b.id);
                                      setBlocked(next);
                                      saveTimeBlocks(BLOCKS_STORAGE_KEY, next);
                                      setEditingBlockId(null);
                                    }}
                                    className="flex-1 rounded-2xl border border-red-200 bg-red-50 py-3 text-xs font-bold text-red-600 hover:bg-red-100 active:scale-95 transition-all"
                                  >
                                    Delete
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setEditingBlockId(null);
                                    }}
                                    className="flex-[2] rounded-2xl bg-[#002855] py-3 text-xs font-bold text-white shadow-lg shadow-[#002855]/20 hover:bg-[#001a3a] active:scale-95 transition-all"
                                  >
                                    Done
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        </>
                      );
                    })()}

                    {dragging && dragging.day === day && (() => {
                      const start = Math.min(dragging.startMinutes, dragging.currentMinutes);
                      const end = Math.max(dragging.startMinutes, dragging.currentMinutes);
                      if (end <= start) return null;
                      const totalMinutes = (END_HOUR - START_HOUR) * 60;
                      const top = ((start - START_HOUR * 60) / totalMinutes) * 100;
                      const height = ((end - start) / totalMinutes) * 100;
                      return (
                        <div
                          className="pointer-events-none absolute left-0.5 right-0.5 rounded-md border-2 border-dashed border-[#002855]/40 bg-[#002855]/10 z-20"
                          style={{ top: `${top}%`, height: `${height}%` }}
                        />
                      );
                    })()}

                    {planned.map((section) => {
                      const hasError = health.conflicts.some(c => c.courseCode === section.courseCode && c.severity === "error");
                      const hasWarning = health.conflicts.some(c => c.courseCode === section.courseCode && c.severity === "warning");
                      const blocks = getMeetingBlocks(section).filter(
                        (b) => b.day === day
                      );
                      return blocks.map((b, idx) => (
                        <div
                          key={`${section.crn}-${day}-${idx}`}
                          className="absolute left-1 right-1 rounded-md border text-[10px] leading-tight dark:border-transparent dark:mix-blend-lighten"
                          style={{
                            top: `${b.top}%`,
                            height: `${b.height}%`,
                            backgroundColor: section.color,
                             borderColor: hasError
                               ? "#EF4444"
                               : hasWarning
                                 ? "#F59E0B"
                                 : "#1D4ED8",
                          }}
                        >
                          <div className="flex h-full flex-col justify-between p-1">
                            <div>
                              <p className="font-semibold text-gray-900 dark:text-slate-900">
                                {section.courseCode}
                              </p>
                              <p className="truncate text-[9px] text-gray-800 dark:text-slate-800/80">
                                {section.title}
                              </p>
                            </div>
                            <p className="text-[9px] text-gray-700">
                              {section.meetings[0]?.startTime}–
                              {section.meetings[0]?.endTime}
                            </p>
                          </div>
                        </div>
                      ));
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {planned.some((s) => !sectionHasMeetingTimes(s)) && (
            <div className="border-t border-gray-100 px-4 py-2.5 text-[11px] text-gray-400">
              Courses with Time TBA won&apos;t appear on the grid until section
              data includes times.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

