"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { RequirementSection } from "@/lib/course-data";

interface DegreeAuditDrawerProps {
  programName: string;
  completedCourses: string[];
  onToggleCourse: (code: string) => void;
  isOpen: boolean;
  onClose: () => void;
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
}

interface ProgramData {
  requirements: RequirementSection[];
  ge: {
    categories: GECategory[];
    notes: string[];
    courseGeMap: Record<string, GECourseInfo>;
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

// --- Major Requirements Tab Components ---

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

  return (
    <div className="border-b border-gray-100 last:border-b-0">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-gray-50"
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
            <span className="text-sm font-medium text-gray-800 truncate">
              {section.heading}
            </span>
            <span className="ml-2 shrink-0 text-xs text-gray-500">
              {completed}/{total}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
            <div
              className="h-1.5 rounded-full bg-[#002855] transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </button>

      {open && (
        <div className="px-5 pb-3">
          {section.notes.length > 0 && (
            <div className="mb-2 space-y-0.5">
              {section.notes.map((note, i) => (
                <p key={i} className="text-xs italic text-gray-500">
                  {note}
                </p>
              ))}
            </div>
          )}
          <div className="space-y-1">
            {section.courses.map((code) => {
              const checked = completedCourses.includes(code);
              return (
                <label
                  key={code}
                  className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggle(code)}
                    className="h-4 w-4 rounded border-gray-300 text-[#002855] accent-[#002855]"
                  />
                  <span
                    className={`text-sm ${
                      checked
                        ? "text-gray-400 line-through"
                        : "text-gray-700"
                    }`}
                  >
                    {code}
                  </span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// --- GE Progress Tab Components ---

function GEAreaRow({
  area,
  completedUnits,
  matchingCourses,
}: {
  area: GEArea;
  completedUnits: number;
  matchingCourses: { code: string; units: number }[];
}) {
  const [expanded, setExpanded] = useState(false);
  const target = area.units_min ?? area.units_required ?? 0;
  const met = completedUnits >= target;
  const pct = target > 0 ? Math.min(100, Math.round((completedUnits / target) * 100)) : 0;

  return (
    <div className="border-b border-gray-50 last:border-b-0">
      <button
        onClick={() => matchingCourses.length > 0 && setExpanded(!expanded)}
        className={`flex w-full items-center gap-3 px-5 py-2.5 text-left ${
          matchingCourses.length > 0 ? "hover:bg-gray-50 cursor-pointer" : "cursor-default"
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
            <span className={`text-sm ${met ? "text-gray-500" : "font-medium text-gray-800"}`}>
              {area.name}
              <span className="ml-1 text-xs text-gray-400">({area.code})</span>
            </span>
            <span className={`ml-2 shrink-0 text-xs ${met ? "font-medium text-green-600" : "text-gray-500"}`}>
              {completedUnits}/{target} units
            </span>
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
      </button>

      {expanded && matchingCourses.length > 0 && (
        <div className="px-5 pb-2 pl-14">
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
}: {
  categories: GECategory[];
  completedCourses: string[];
  courseGeMap: Record<string, GECourseInfo>;
}) {
  const geProgress = useMemo(() => {
    const areaUnits: Record<string, number> = {};
    const areaCourses: Record<string, { code: string; units: number }[]> = {};

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
      <div className="px-5 py-8 text-center text-sm text-gray-400">
        GE requirement data is not available.
      </div>
    );
  }

  return (
    <div>
      {categories.map((cat) => (
        <div key={cat.name}>
          <div className="sticky top-0 z-10 border-b border-gray-200 bg-gray-50 px-5 py-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                {cat.name}
              </h3>
              <span className="text-xs text-gray-400">
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
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// --- Main Drawer ---

export function DegreeAuditDrawer({
  programName,
  completedCourses,
  onToggleCourse,
  isOpen,
  onClose,
}: DegreeAuditDrawerProps) {
  const [sections, setSections] = useState<DisplaySection[]>([]);
  const [geCategories, setGeCategories] = useState<GECategory[]>([]);
  const [courseGeMap, setCourseGeMap] = useState<Record<string, GECourseInfo>>({});
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
      setCourseGeMap(data.ge.courseGeMap);
    } catch {
      setError("Could not load program requirements.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen && programName) {
      fetchProgram(programName);
    }
  }, [isOpen, programName, fetchProgram]);

  useEffect(() => {
    if (!isOpen) return;
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleEsc);
    return () => document.removeEventListener("keydown", handleEsc);
  }, [isOpen, onClose]);

  const allCourses = sections.flatMap((s) => s.courses);
  const totalCompleted = allCourses.filter((c) =>
    completedCourses.includes(c)
  ).length;
  const totalCourses = allCourses.length;
  const overallPct =
    totalCourses > 0
      ? Math.round((totalCompleted / totalCourses) * 100)
      : 0;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 bg-black/30 transition-opacity duration-300 ${
          isOpen
            ? "pointer-events-auto opacity-100"
            : "pointer-events-none opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Drawer */}
      <div
        className={`fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col bg-white shadow-2xl transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="border-b border-gray-200 bg-[#002855] px-5 py-4 text-white">
          <div className="flex items-start justify-between">
            <div className="min-w-0 flex-1 pr-4">
              <h2 className="text-base font-semibold leading-tight truncate">
                {programName}
              </h2>
              <p className="mt-0.5 text-xs text-blue-200">Degree Audit</p>
            </div>
            <button
              onClick={onClose}
              className="shrink-0 rounded-lg p-1 text-white/70 hover:bg-white/10 hover:text-white"
              aria-label="Close drawer"
            >
              <svg
                className="h-5 w-5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {!loading && !error && totalCourses > 0 && activeTab === "major" && (
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-blue-200">
                  {totalCompleted} of {totalCourses} major courses completed
                </span>
                <span className="font-medium text-[#DAAA00]">
                  {overallPct}%
                </span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-white/20">
                <div
                  className="h-2 rounded-full bg-[#DAAA00] transition-all duration-500"
                  style={{ width: `${overallPct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Tabs */}
        {!loading && !error && (
          <div className="flex border-b border-gray-200 bg-white">
            <button
              onClick={() => setActiveTab("major")}
              className={`flex-1 px-4 py-2.5 text-center text-sm font-medium transition-colors ${
                activeTab === "major"
                  ? "border-b-2 border-[#002855] text-[#002855]"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Major Requirements
            </button>
            <button
              onClick={() => setActiveTab("ge")}
              className={`flex-1 px-4 py-2.5 text-center text-sm font-medium transition-colors ${
                activeTab === "ge"
                  ? "border-b-2 border-[#002855] text-[#002855]"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              General Education
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex items-center justify-center py-16">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#002855] border-t-transparent" />
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

          {!loading && !error && activeTab === "ge" && (
            <GEProgressView
              categories={geCategories}
              completedCourses={completedCourses}
              courseGeMap={courseGeMap}
            />
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 bg-gray-50 px-5 py-3">
          <p className="text-xs text-gray-400">
            {activeTab === "major"
              ? "Check off courses you\u2019ve completed. Changes sync automatically with the chat advisor."
              : "GE progress is calculated from your completed courses. Courses can count toward both major and GE requirements."}
          </p>
        </div>
      </div>
    </>
  );
}
