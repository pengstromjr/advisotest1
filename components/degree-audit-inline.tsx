"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { RequirementSection, StudentContext } from "@/lib/course-data";
import { SmartGeModal } from "./schedule-planner/smart-ge-modal";
import { Sparkles } from "lucide-react";

interface DegreeAuditInlineProps {
  programName: string;
  studentContext: StudentContext;
  onToggleCourse: (code: string) => void;
  onProgress?: (completed: number, total: number) => void;
}

interface DisplaySection {
  heading: string;
  notes: string[];
  units: string;
  courses: string[];
}

interface GEArea {
  code: string;
  name: string;
  units_min?: number;
  units_max?: number;
  units_required?: number;
}

interface GECategory {
  name: string;
  units_required: number;
  areas: GEArea[];
}

interface GECourseInfo {
  ge_areas: string[];
  units: number | string;
  prerequisites?: string;
}

interface ProgramData {
  requirements: RequirementSection[];
  ge: {
    categories: GECategory[];
    notes: string[];
    courseInfoMap: Record<string, GECourseInfo>;
  };
}

type Tab = "major" | "ge";

function deduplicateSections(
  sections: RequirementSection[]
): DisplaySection[] {
  const seen = new Set<string>();
  const result: DisplaySection[] = [];

  for (const section of sections) {
    const uniqueCourses: string[] = [];
    for (const code of section.courses) {
      const normalized = code.trim();
      if (normalized && !seen.has(normalized)) {
        seen.add(normalized);
        uniqueCourses.push(normalized);
      }
    }
    if (uniqueCourses.length > 0 || section.notes.length > 0) {
      result.push({
        heading: section.heading,
        notes: section.notes,
        units: section.units,
        courses: uniqueCourses,
      });
    }
  }

  return result.filter((s) => s.courses.length > 0);
}

function parseUnits(u: number | string): number {
  if (typeof u === "number") return u;
  const match = String(u).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function SectionBlock({
  section,
  completedCourses,
  onToggle,
  defaultOpen,
}: {
  section: DisplaySection;
  completedCourses: string[];
  onToggle: (code: string) => void;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const completed = section.courses.filter((c) =>
    completedCourses.includes(c)
  ).length;
  const total = section.courses.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const headingTrimmed = section.heading.trim();
  const isChooseOne = /^choose\s+one\b/i.test(headingTrimmed);
  const displayHeading = isChooseOne ? "" : headingTrimmed;

  return (
    <div className="border-b border-gray-100 dark:border-slate-800 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 dark:hover:bg-slate-800/50"
      >
        <svg
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? "rotate-90" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 5l7 7-7 7"
          />
        </svg>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-800 dark:text-slate-100 truncate">
              {displayHeading || "Course options"}
            </span>
            <span className="ml-2 shrink-0 text-xs text-gray-500 dark:text-slate-400">
              {completed}/{total}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200 dark:bg-slate-700">
            <div
              className="h-1.5 rounded-full bg-[#002855] dark:bg-blue-600 transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </button>

      {open && (
        <div className="px-4 pb-3">
          {section.notes.length > 0 && (
            <div className="mb-2 flex flex-wrap gap-x-3 gap-y-1">
              {section.notes
                .filter(note => {
                  const n = note.toLowerCase();
                  // Skip redundant "Choose one" if heading already handled it
                  if (isChooseOne && (n === "choose one:" || n === "choose one")) return false;
                  return true;
                })
                .map((note, i) => {
                  // Clean up specialization prefixes for a cleaner look
                  const cleanNote = note.replace(/^Specialization:\s*/i, "");
                  const isPrefixed = /^Specialization:/i.test(note);
                  
                  return (
                    <p key={i} className={`text-[10px] italic ${isPrefixed ? "text-blue-500/70 dark:text-blue-400/60 font-medium" : "text-gray-500 dark:text-slate-400"}`}>
                      {isPrefixed ? "• " : ""}{cleanNote}
                    </p>
                  );
                })}
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-2">
            {section.courses.map((code) => {
              const checked = completedCourses.includes(code);
              return (
                <button
                  key={code}
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggle(code);
                  }}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all ${
                    checked
                      ? "bg-[#002855] dark:bg-blue-600 text-white shadow-md shadow-[#002855]/10"
                      : "bg-gray-100 dark:bg-slate-900/50 text-gray-700 dark:text-slate-400 hover:bg-gray-200 dark:hover:bg-slate-800 hover:text-gray-900 dark:hover:text-slate-200 border border-transparent dark:border-slate-800/80 shadow-sm"
                  }`}
                >
                  {checked && (
                    <svg
                      className="h-3.5 w-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                  {code}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function GEAreaRow({
  area,
  completedUnits,
  matchingCourses,
  onSmartMatch,
}: {
  area: GEArea;
  completedUnits: number;
  matchingCourses: { code: string; units: number }[];
  onSmartMatch: (area: GEArea) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const target = area.units_min ?? area.units_required ?? 0;
  const met = completedUnits >= target;
  const pct =
    target > 0
      ? Math.min(100, Math.round((completedUnits / target) * 100))
      : 0;

  return (
    <div className="border-b border-gray-50 dark:border-slate-800 last:border-b-0">
      <div
        onClick={() => matchingCourses.length > 0 && setExpanded(!expanded)}
        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
          matchingCourses.length > 0
            ? "cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800"
            : "cursor-default"
        }`}
      >
        <div className="flex h-5 w-5 shrink-0 items-center justify-center">
          {met ? (
            <svg
              className="h-5 w-5 text-green-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2.5}
                d="M5 13l4 4L19 7"
              />
            </svg>
          ) : (
            <div className="h-3 w-3 rounded-full border-2 border-gray-300" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between">
            <span
              className={`text-sm ${met ? "text-gray-500" : "font-medium text-gray-800"}`}
            >
              {area.name}
              <span className="ml-1 text-xs text-gray-400">
                ({area.code})
              </span>
            </span>
            <div className="flex items-center gap-3">
              {!met && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSmartMatch(area);
                  }}
                  className="flex items-center gap-1 rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold text-[#002855] hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-200"
                >
                  <Sparkles className="h-3 w-3" />
                  Find Match
                </button>
              )}
              <span
                className={`ml-2 shrink-0 text-xs ${met ? "font-medium text-green-600" : "text-gray-500"}`}
              >
                {completedUnits}/{target} units
              </span>
            </div>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${met ? "bg-green-500" : "bg-[#DAAA00]"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        {matchingCourses.length > 0 && (
          <svg
            className={`h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        )}
      </div>

      {expanded && matchingCourses.length > 0 && (
        <div className="px-4 pb-2 pl-14">
          <div className="space-y-0.5">
            {matchingCourses.map((c) => (
              <div
                key={c.code}
                className="flex items-center justify-between text-xs text-gray-500"
              >
                <span>{c.code}</span>
                <span>{c.units} units</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function GEProgressView({
  categories,
  completedCourses,
  courseGeMap,
  onSmartMatch,
}: {
  categories: GECategory[];
  completedCourses: string[];
  courseGeMap: Record<string, GECourseInfo>;
  onSmartMatch: (area: GEArea) => void;
}) {
  const geProgress = useMemo(() => {
    const areaUnits: Record<string, number> = {};
    const areaCourses: Record<
      string,
      { code: string; units: number }[]
    > = {};

    for (const code of completedCourses) {
      const info = courseGeMap[code];
      if (!info) continue;
      const units = parseUnits(info.units);
      for (const area of info.ge_areas) {
        areaUnits[area] = (areaUnits[area] || 0) + units;
        if (!areaCourses[area]) areaCourses[area] = [];
        areaCourses[area].push({ code, units });
      }
    }

    return { areaUnits, areaCourses };
  }, [completedCourses, courseGeMap]);

  if (categories.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-gray-400">
        GE requirement data is not available.
      </div>
    );
  }

  return (
    <div>
      {categories.map((cat) => (
        <div key={cat.name}>
          <div className="border-b border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 px-4 py-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-slate-400">
                {cat.name}
              </h4>
              <span className="text-xs text-gray-400 dark:text-slate-500">
                {cat.units_required} units
              </span>
            </div>
          </div>
          {cat.areas.map((area) => (
            <GEAreaRow
              key={area.code}
              area={area}
              completedUnits={geProgress.areaUnits[area.code] || 0}
              matchingCourses={geProgress.areaCourses[area.code] || []}
              onSmartMatch={onSmartMatch}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function DegreeAuditInline({
  programName,
  studentContext,
  onToggleCourse,
  onProgress,
}: DegreeAuditInlineProps) {
  const completedCourses = studentContext.completedCourses;
  const [matchingArea, setMatchingArea] = useState<GEArea | null>(null);
  const [sections, setSections] = useState<DisplaySection[]>([]);
  const [geCategories, setGeCategories] = useState<GECategory[]>([]);
  const [courseGeMap, setCourseGeMap] = useState<
    Record<string, GECourseInfo>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("major");

  const fetchProgram = useCallback(async (name: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/data/program?name=${encodeURIComponent(name)}`
      );
      if (!res.ok) throw new Error("Failed to load");
      const data: ProgramData = await res.json();
      setSections(deduplicateSections(data.requirements));
      setGeCategories(data.ge.categories);
      setCourseGeMap(data.ge.courseInfoMap);
    } catch {
      setError("Could not load program requirements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (programName) {
      fetchProgram(programName);
    }
  }, [programName, fetchProgram]);

  const allCourses = sections.flatMap((s) => s.courses);
  const totalCompleted = allCourses.filter((c) =>
    completedCourses.includes(c)
  ).length;
  const totalCourses = allCourses.length;
  const overallPct =
    totalCourses > 0
      ? Math.round((totalCompleted / totalCourses) * 100)
      : 0;

  useEffect(() => {
    onProgress?.(totalCompleted, totalCourses);
  }, [totalCompleted, totalCourses, onProgress]);

  return (
    <div className="flex flex-col">
      {/* Compact header */}
      <div className="border-b border-gray-200 bg-[#002855] px-4 py-3 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold">Degree Audit</h3>
            <p className="mt-0.5 text-xs text-blue-200">{programName}</p>
          </div>
          {!loading && !error && totalCourses > 0 && (
            <span className="text-xs font-medium text-[#DAAA00]">
              {totalCompleted}/{totalCourses} ({overallPct}%)
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      {!loading && !error && (
        <div className="flex border-b border-gray-200 dark:border-slate-800">
          <button
            onClick={() => setActiveTab("major")}
            className={`flex-1 px-4 py-2.5 text-center text-sm font-medium transition-all ${
              activeTab === "major"
                ? "border-b-2 border-[#002855] dark:border-blue-500 text-[#002855] dark:text-slate-100 bg-blue-50/30 dark:bg-blue-900/10"
                : "text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/50"
            }`}
          >
            Major Requirements
          </button>
          <button
            onClick={() => setActiveTab("ge")}
            className={`flex-1 px-4 py-2.5 text-center text-sm font-medium transition-all ${
              activeTab === "ge"
                ? "border-b-2 border-[#002855] dark:border-blue-500 text-[#002855] dark:text-slate-100 bg-blue-50/30 dark:bg-blue-900/10"
                : "text-gray-500 dark:text-slate-500 hover:text-gray-700 dark:hover:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800/50"
            }`}
          >
            General Education
          </button>
        </div>
      )}

      {/* Body */}
      <div>
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#002855] border-t-transparent" />
            <span className="ml-3 text-sm text-gray-500">
              Loading requirements...
            </span>
          </div>
        )}

        {error && (
          <div className="px-5 py-8 text-center text-sm text-red-500">
            {error}
          </div>
        )}

        {!loading && !error && activeTab === "major" && (
          <>
            {sections.length === 0 ? (
              <div className="px-5 py-8 text-center text-sm text-gray-400">
                No requirement data available for this program.
              </div>
            ) : (
              sections.map((section, i) => (
                <SectionBlock
                  key={`${section.heading}-${i}`}
                  section={section}
                  completedCourses={completedCourses}
                  onToggle={onToggleCourse}
                  defaultOpen={i < 3}
                />
              ))
            )}
          </>
        )}

        {activeTab === "ge" && (
          <GEProgressView
            categories={geCategories}
            completedCourses={completedCourses}
            courseGeMap={courseGeMap}
            onSmartMatch={setMatchingArea}
          />
        )}
      </div>

      <SmartGeModal
        open={!!matchingArea}
        onClose={() => setMatchingArea(null)}
        geArea={matchingArea || { code: "", name: "" }}
        studentContext={studentContext}
      />

      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 px-4 py-2.5">
        <p className="text-xs text-gray-400 dark:text-slate-500">
          {activeTab === "major"
            ? "Check off courses. Changes sync with the AI advisor."
            : "GE progress updates as you check off courses."}
        </p>
      </div>
    </div>
  );
}
