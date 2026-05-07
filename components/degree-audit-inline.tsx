"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import type { RequirementSection, StudentContext, Section } from "@/lib/course-data";
import { SmartGeModal } from "./schedule-planner/smart-ge-modal";
import { CourseDetailModal } from "./schedule-planner/course-detail-modal";
import {
  cleanRequirementPathLabel,
  pathKindWithArticle,
  RequirementPathSelector,
  requirementPathKind,
} from "./requirement-path-selector";
import { Sparkles, Info } from "lucide-react";
import { UNOFFICIAL_DEGREE_NOTICE } from "@/lib/legal-notices";
import {
  getRequirementItemProgress,
  getRequirementSectionProgress,
  getDefaultRequirementPath,
  getRequirementPathGroups,
  filterRequirementSectionsByPath,
  normalizeRequirementSections,
  type NormalizedRequirementItem,
  type NormalizedRequirementSection,
} from "@/lib/requirement-normalizer";
import { normalizeCourseCode } from "@/lib/course-code";
import {
  getEnglishCompositionProgress,
  type EnglishCompositionProgress,
} from "@/lib/english-composition";

interface DegreeAuditInlineProps {
  programName: string;
  studentContext: StudentContext;
  onToggleCourse: (code: string) => void;
  onProgress?: (completed: number, total: number) => void;
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

const TOPICAL_BREADTH_CODES = new Set(["AH", "SE", "SS"]);
const GE_ASSIGNMENT_OVERRIDES_KEY = "adviso-ge-assignment-overrides";

interface GEAssignedCourse {
  code: string;
  units: number;
  eligibleAreas: string[];
  manual?: boolean;
}

type GEAssignmentOverrides = Record<string, Record<string, string>>;

function parseUnits(u: number | string): number {
  if (typeof u === "number") return u;
  const match = String(u).match(/(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

function normalizeCourseCodeForLookup(code: string): string {
  return normalizeCourseCode(code);
}

function removeEnglishCompositionWritingExperience(
  courseGeMap: Record<string, GECourseInfo>,
  englishCompositionUsedCodes: Set<string>
) {
  const next = { ...courseGeMap };
  for (const code of englishCompositionUsedCodes) {
    const info = next[code];
    if (!info) continue;
    next[code] = {
      ...info,
      ge_areas: (info.ge_areas || []).filter((area) => area !== "WE"),
    };
  }
  return next;
}

function getAreaTarget(area: GEArea): number {
  return area.units_min ?? area.units_required ?? 0;
}

function allocateGeCoursesForCategory(
  completedCourses: string[],
  courseGeMap: Record<string, GECourseInfo>,
  areas: GEArea[],
  overrides: Record<string, string> = {}
) {
  const areaByCode = new Map(areas.map((area) => [area.code, area]));
  const areaUnits: Record<string, number> = {};
  const areaCourses: Record<string, GEAssignedCourse[]> = {};
  for (const area of areas) {
    areaUnits[area.code] = 0;
    areaCourses[area.code] = [];
  }

  const seenCourses = new Set<string>();
  const candidates = completedCourses
    .map((rawCode) => {
      const code = normalizeCourseCodeForLookup(rawCode);
      if (seenCourses.has(code)) return null;
      seenCourses.add(code);
      const info = courseGeMap[code] || courseGeMap[rawCode];
      if (!info) return null;
      const units = parseUnits(info.units);
      if (units <= 0) return null;
      const eligibleAreas = Array.from(
        new Set((info.ge_areas || []).filter((area) => areaByCode.has(area)))
      );
      if (eligibleAreas.length === 0) return null;
      return { code, units, eligibleAreas };
    })
    .filter(
      (candidate): candidate is { code: string; units: number; eligibleAreas: string[] } =>
        Boolean(candidate)
    )
    .sort((a, b) => {
      if (a.eligibleAreas.length !== b.eligibleAreas.length) {
        return a.eligibleAreas.length - b.eligibleAreas.length;
      }
      if (a.units !== b.units) return b.units - a.units;
      return a.code.localeCompare(b.code);
    });

  const assignCandidate = (
    candidate: { code: string; units: number; eligibleAreas: string[] },
    areaCode: string,
    manual = false
  ) => {
    const area = areaByCode.get(areaCode);
    const current = areaUnits[areaCode] || 0;
    const next = current + candidate.units;
    areaUnits[areaCode] = area?.units_max == null ? next : Math.min(area.units_max, next);
    areaCourses[areaCode].push({
      code: candidate.code,
      units: candidate.units,
      eligibleAreas: candidate.eligibleAreas,
      manual,
    });
  };

  const autoCandidates: typeof candidates = [];
  for (const candidate of candidates) {
    const manualArea = overrides[candidate.code];
    if (manualArea && candidate.eligibleAreas.includes(manualArea)) {
      assignCandidate(candidate, manualArea, true);
    } else {
      autoCandidates.push(candidate);
    }
  }

  for (const candidate of autoCandidates) {
    let bestArea = "";
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const areaCode of candidate.eligibleAreas) {
      const area = areaByCode.get(areaCode);
      if (!area) continue;
      const current = areaUnits[areaCode] || 0;
      const target = getAreaTarget(area);
      const max = area.units_max;
      if (max != null && current >= max) continue;
      const unmet = Math.max(0, target - current);
      const roomToMax = max == null ? Number.POSITIVE_INFINITY : Math.max(0, max - current);
      const score =
        unmet > 0
          ? 1_000_000 + unmet * 100 - current
          : TOPICAL_BREADTH_CODES.has(areaCode)
            ? roomToMax * 10 - current
            : -current;

      if (score > bestScore) {
        bestArea = areaCode;
        bestScore = score;
      }
    }

    if (!bestArea) continue;
    assignCandidate(candidate, bestArea);
  }

  return { areaUnits, areaCourses };
}

function SectionBlock({
  section,
  completedCourses,
  onToggle,
  defaultOpen,
  onCourseInfo,
  requirementPaths,
  selectedRequirementPath,
  onSelectRequirementPath,
}: {
  section: NormalizedRequirementSection;
  completedCourses: string[];
  onToggle: (code: string) => void;
  defaultOpen: boolean;
  onCourseInfo: (code: string) => void;
  requirementPaths: string[];
  selectedRequirementPath: string;
  onSelectRequirementPath: (path: string) => void;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const { completed, total } = getRequirementSectionProgress(section, completedCourses);
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const headingTrimmed = section.heading.trim();
  const isChooseOne = /^choose\s+one\b/i.test(headingTrimmed);
  const displayHeading = isChooseOne ? "" : headingTrimmed;
  const informational = section.items.length === 0;
  const shouldShowPathJumps =
    informational &&
    requirementPaths.length > 1 &&
    /\b(?:depth|upper division|emphasis)\b/i.test(
      `${section.heading} ${section.notes.join(" ")}`
    );
  const alternatePaths = requirementPaths.filter((path) => path !== selectedRequirementPath);
  const pathKind = requirementPathKind(requirementPaths);

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
              {informational ? (section.units ? `${section.units} units` : "Catalog note") : `${completed}/${total}`}
            </span>
          </div>
          {!informational && (
            <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200 dark:bg-slate-700">
              <div
                className="h-1.5 rounded-full bg-[#002855] dark:bg-blue-600 transition-all duration-300"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}
        </div>
      </button>

      {open && (
        <div className="px-4 pb-3">
          {section.notes.length > 0 && !shouldShowPathJumps && (
            <div className={informational ? "mb-2 space-y-1.5" : "mb-2 flex flex-wrap gap-x-3 gap-y-1"}>
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
                    <p key={i} className={
                      informational
                        ? "max-w-4xl text-sm leading-6 text-gray-600 dark:text-slate-300"
                        : `text-[10px] italic ${isPrefixed ? "text-blue-500/70 dark:text-blue-400/60 font-medium" : "text-gray-500 dark:text-slate-400"}`
                    }>
                      {isPrefixed || informational ? "• " : ""}{cleanNote}
                    </p>
                  );
                })}
            </div>
          )}
          {shouldShowPathJumps && alternatePaths.length > 0 && (
            <div className="mt-3 rounded-2xl border border-[#002855]/10 bg-blue-50/50 p-3 dark:border-blue-500/20 dark:bg-blue-950/20">
              <p className="text-xs font-medium text-gray-600 dark:text-slate-300">
                Choose {pathKindWithArticle(pathKind)} to see the specific depth checklist.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {alternatePaths.map((path) => (
                  <button
                    key={path}
                    type="button"
                    onClick={() => onSelectRequirementPath(path)}
                    className="rounded-full bg-[#002855] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md dark:bg-blue-600"
                  >
                    {cleanRequirementPathLabel(path)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {section.items.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {section.items.map((item) => (
                <RequirementItemBlock
                  key={item.id}
                  item={item}
                  completedCourses={completedCourses}
                  onToggle={onToggle}
                  onCourseInfo={onCourseInfo}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RequirementItemBlock({
  item,
  completedCourses,
  onToggle,
  onCourseInfo,
}: {
  item: NormalizedRequirementItem;
  completedCourses: string[];
  onToggle: (code: string) => void;
  onCourseInfo: (code: string) => void;
}) {
  const done = getRequirementItemProgress(item, completedCourses);
  const complete = done >= item.requiredCount;
  const label =
    item.kind === "series"
      ? item.label
      : item.kind === "choice"
        ? item.requiredCount === 1
          ? "Choose one"
          : `Choose ${item.requiredCount}`
        : "";

  if (item.kind === "course") {
    const code = item.courses[0];
    const checked = completedCourses.includes(code);
    return (
      <CoursePill
        code={code}
        checked={checked}
        onToggle={onToggle}
        onCourseInfo={onCourseInfo}
      />
    );
  }

  return (
    <div
      className={`flex max-w-full flex-col gap-2 rounded-2xl border px-2.5 py-2 ${
        complete
          ? "border-[#002855]/20 bg-[#002855]/5 dark:border-blue-500/30 dark:bg-blue-500/10"
          : "border-gray-200 bg-gray-50/60 dark:border-slate-800 dark:bg-slate-900/40"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-slate-400">
          {label}
        </span>
        <span className={`text-[10px] font-semibold ${complete ? "text-green-600 dark:text-green-400" : "text-gray-400"}`}>
          {done}/{item.requiredCount}
        </span>
      </div>

      {item.kind === "series" && item.options?.length ? (
        <div className="space-y-1.5">
          {item.options.map((option, index) => {
            const optionDone = option.filter((code) => completedCourses.includes(code)).length;
            const optionLabel = item.label.toLowerCase().includes("path") ? "Option" : "Series";
            return (
              <div key={`${item.id}-option-${index}`} className="rounded-xl bg-white/70 p-1.5 dark:bg-slate-950/30">
                <div className="mb-1 text-[10px] font-semibold text-gray-400">
                  {optionLabel} {index + 1} · {optionDone}/{option.length}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {option.map((code) => (
                    <CoursePill
                      key={code}
                      code={code}
                      checked={completedCourses.includes(code)}
                      onToggle={onToggle}
                      onCourseInfo={onCourseInfo}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {item.courses.map((code) => (
            <CoursePill
              key={code}
              code={code}
              checked={completedCourses.includes(code)}
              onToggle={onToggle}
              onCourseInfo={onCourseInfo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function CoursePill({
  code,
  checked,
  onToggle,
  onCourseInfo,
}: {
  code: string;
  checked: boolean;
  onToggle: (code: string) => void;
  onCourseInfo: (code: string) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggle(code);
        }}
        className={`flex items-center gap-1.5 rounded-l-full pl-3 pr-1.5 py-1.5 text-sm font-medium transition-all ${
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
      <button
        onClick={(e) => {
          e.stopPropagation();
          onCourseInfo(code);
        }}
        title="View course details"
        className={`flex items-center justify-center rounded-r-full pr-2.5 pl-1 py-1.5 transition-all ${
          checked
            ? "bg-[#002855] dark:bg-blue-600 text-blue-200 hover:text-white"
            : "bg-gray-100 dark:bg-slate-900/50 text-gray-400 dark:text-slate-500 hover:text-blue-500 dark:hover:text-blue-400 border border-transparent dark:border-slate-800/80 shadow-sm"
        }`}
      >
        <Info className="h-3 w-3" />
      </button>
    </div>
  );
}

function GEAreaRow({
  area,
  areas,
  completedUnits,
  matchingCourses,
  onSmartMatch,
  onMoveCourse,
  onClearCourseMove,
}: {
  area: GEArea;
  areas: GEArea[];
  completedUnits: number;
  matchingCourses: GEAssignedCourse[];
  onSmartMatch: (area: GEArea) => void;
  onMoveCourse: (code: string, areaCode: string) => void;
  onClearCourseMove: (code: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const areaLabels = useMemo(
    () => new Map(areas.map((candidate) => [candidate.code, candidate])),
    [areas]
  );
  const target = area.units_min ?? area.units_required ?? 0;
  const unitLabel =
    area.units_max == null
      ? `${completedUnits}/${target} units`
      : `${completedUnits}/${target}-${area.units_max} units`;
  const met = completedUnits >= target;
  const pct =
    target > 0
      ? Math.min(100, Math.round((completedUnits / target) * 100))
      : 0;
  const rawCourseUnits = matchingCourses.reduce((sum, course) => sum + course.units, 0);
  const cappedByMax = area.units_max != null && rawCourseUnits > completedUnits;

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
                {unitLabel}
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
                className="flex flex-wrap items-center justify-between gap-2 text-xs text-gray-500"
              >
                <div className="min-w-0">
                  <span>{c.code}</span>
                  {c.manual && (
                    <span className="ml-2 rounded-full bg-[#DAAA00]/10 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#8A6A00]">
                      moved
                    </span>
                  )}
                </div>
                <div
                  className="ml-auto flex items-center gap-2"
                  onClick={(event) => event.stopPropagation()}
                >
                  {c.eligibleAreas.length > 1 && (
                    <>
                      <label className="sr-only" htmlFor={`ge-move-${area.code}-${c.code.replace(/\W+/g, "-")}`}>
                        Move {c.code}
                      </label>
                      <select
                        id={`ge-move-${area.code}-${c.code.replace(/\W+/g, "-")}`}
                        value={area.code}
                        onChange={(event) => onMoveCourse(c.code, event.target.value)}
                        className="rounded-md border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600 outline-none transition-colors hover:border-[#002855]/30 focus:border-[#002855] focus:ring-2 focus:ring-[#002855]/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                      >
                        {c.eligibleAreas.map((areaCode) => {
                          const eligibleArea = areaLabels.get(areaCode);
                          return (
                            <option key={areaCode} value={areaCode}>
                              {eligibleArea ? `${eligibleArea.name} (${areaCode})` : areaCode}
                            </option>
                          );
                        })}
                      </select>
                      {c.manual && (
                        <button
                          type="button"
                          onClick={() => onClearCourseMove(c.code)}
                          className="text-[10px] font-semibold text-gray-400 transition-colors hover:text-[#002855] dark:hover:text-blue-300"
                        >
                          Auto
                        </button>
                      )}
                    </>
                  )}
                  <span>{c.units} units</span>
                </div>
              </div>
            ))}
            {cappedByMax && (
              <p className="pt-1 text-[10px] text-gray-400">
                Counted units are capped at the {area.units_max}-unit Topical Breadth maximum.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function EnglishCompositionRow({ progress }: { progress: EnglishCompositionProgress }) {
  const [expanded, setExpanded] = useState(false);
  const met = progress.completedUnits >= progress.requiredUnits;
  const pct = Math.min(
    100,
    Math.round((progress.completedUnits / progress.requiredUnits) * 100)
  );

  return (
    <div className="border-b border-gray-50 dark:border-slate-800">
      <div
        onClick={() => progress.courses.length > 0 && setExpanded(!expanded)}
        className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
          progress.courses.length > 0
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
          <div className="flex items-center justify-between gap-3">
            <span
              className={`text-sm ${met ? "text-gray-500" : "font-medium text-gray-800 dark:text-slate-200"}`}
            >
              English Composition
              <span className="ml-1 text-xs text-gray-400">(EC)</span>
            </span>
            <span
              className={`shrink-0 text-xs ${met ? "font-medium text-green-600" : "text-gray-500 dark:text-slate-400"}`}
            >
              {progress.completedUnits}/{progress.requiredUnits} units
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full rounded-full bg-gray-200">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${met ? "bg-green-500" : "bg-[#DAAA00]"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] leading-snug text-gray-400 dark:text-slate-500">
            {progress.summary}
          </p>
          {progress.unmetNotes.length > 0 && (
            <p className="mt-1 text-[10px] leading-snug text-amber-600 dark:text-amber-400">
              {progress.unmetNotes[0]}
            </p>
          )}
        </div>
        {progress.courses.length > 0 && (
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
      {expanded && progress.courses.length > 0 && (
        <div className="px-4 pb-2 pl-14">
          <div className="space-y-0.5">
            {progress.courses.map((course) => (
              <div
                key={course.code}
                className="flex items-center justify-between gap-2 text-xs text-gray-500"
              >
                <span>{course.code}</span>
                <span>
                  {course.units} units · {course.role.replace("-", " ")}
                </span>
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
  programName,
  requirements,
  onSmartMatch,
}: {
  categories: GECategory[];
  completedCourses: string[];
  courseGeMap: Record<string, GECourseInfo>;
  programName: string;
  requirements: RequirementSection[];
  onSmartMatch: (area: GEArea) => void;
}) {
  const [assignmentOverrides, setAssignmentOverrides] = useState<GEAssignmentOverrides>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(GE_ASSIGNMENT_OVERRIDES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      GE_ASSIGNMENT_OVERRIDES_KEY,
      JSON.stringify(assignmentOverrides)
    );
  }, [assignmentOverrides]);

  const moveCourse = useCallback((categoryName: string, code: string, areaCode: string) => {
    const normalizedCode = normalizeCourseCodeForLookup(code);
    setAssignmentOverrides((current) => ({
      ...current,
      [categoryName]: {
        ...(current[categoryName] || {}),
        [normalizedCode]: areaCode,
      },
    }));
  }, []);

  const clearCourseMove = useCallback((categoryName: string, code: string) => {
    const normalizedCode = normalizeCourseCodeForLookup(code);
    setAssignmentOverrides((current) => {
      const categoryOverrides = { ...(current[categoryName] || {}) };
      delete categoryOverrides[normalizedCode];
      return {
        ...current,
        [categoryName]: categoryOverrides,
      };
    });
  }, []);

  const englishCompositionProgress = useMemo(
    () =>
      getEnglishCompositionProgress(completedCourses, courseGeMap, {
        programName,
        requirements,
      }),
    [completedCourses, courseGeMap, programName, requirements]
  );

  const courseGeMapForGe = useMemo(
    () =>
      removeEnglishCompositionWritingExperience(
        courseGeMap,
        englishCompositionProgress.usedCodes
      ),
    [courseGeMap, englishCompositionProgress]
  );

  const geProgress = useMemo(() => {
    const areaUnits: Record<string, number> = {};
    const areaCourses: Record<string, GEAssignedCourse[]> = {};

    for (const category of categories) {
      const allocated = allocateGeCoursesForCategory(
        completedCourses,
        courseGeMapForGe,
        category.areas,
        assignmentOverrides[category.name] || {}
      );
      Object.assign(areaUnits, allocated.areaUnits);
      Object.assign(areaCourses, allocated.areaCourses);
    }

    return { areaUnits, areaCourses };
  }, [assignmentOverrides, categories, completedCourses, courseGeMapForGe]);

  if (categories.length === 0) {
    return (
      <div className="py-6 text-center text-sm text-gray-400">
        GE requirement data is not available.
      </div>
    );
  }

  return (
    <div>
      <div className="border-b border-gray-200 dark:border-slate-800 px-4 py-2 text-xs text-gray-500 dark:text-slate-400">
        GE-designated major courses may count here too. Multi-tag courses can be moved between eligible areas, but count once within Topical Breadth and once within Core Literacies.
      </div>
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
          {cat.name === "Core Literacies" && (
            <EnglishCompositionRow progress={englishCompositionProgress} />
          )}
          {cat.areas.map((area) => (
            <GEAreaRow
              key={area.code}
              area={area}
              areas={cat.areas}
              completedUnits={geProgress.areaUnits[area.code] || 0}
              matchingCourses={geProgress.areaCourses[area.code] || []}
              onSmartMatch={onSmartMatch}
              onMoveCourse={(code, areaCode) => moveCourse(cat.name, code, areaCode)}
              onClearCourseMove={(code) => clearCourseMove(cat.name, code)}
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
  const [requirements, setRequirements] = useState<RequirementSection[]>([]);
  const [selectedRequirementPath, setSelectedRequirementPath] = useState("");
  const [geCategories, setGeCategories] = useState<GECategory[]>([]);
  const [courseGeMap, setCourseGeMap] = useState<
    Record<string, GECourseInfo>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<Tab>("major");
  const [detailSection, setDetailSection] = useState<Section | null>(null);

  const openCourseDetail = useCallback(async (code: string) => {
    try {
      const res = await fetch(`/api/sections?q=${encodeURIComponent(code)}&limit=1`);
      const data = await res.json();
      if (data.sections?.length > 0) {
        setDetailSection(data.sections[0]);
      }
    } catch {}
  }, []);

  const fetchProgram = useCallback(async (name: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(
        `/api/data/program?name=${encodeURIComponent(name)}`
      );
      if (!res.ok) throw new Error("Failed to load");
      const data: ProgramData = await res.json();
      setRequirements(data.requirements);
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

  const requirementPaths = useMemo(() => getRequirementPathGroups(requirements), [requirements]);

  useEffect(() => {
    setSelectedRequirementPath((current) => {
      if (requirementPaths.length <= 1) return "";
      if (current && requirementPaths.includes(current)) return current;
      return getDefaultRequirementPath(requirements);
    });
  }, [requirements, requirementPaths]);

  const visibleRequirements = useMemo(
    () => filterRequirementSectionsByPath(requirements, selectedRequirementPath),
    [requirements, selectedRequirementPath]
  );

  const sections = useMemo(
    () => normalizeRequirementSections(visibleRequirements),
    [visibleRequirements]
  );

  const sectionProgress = sections.map((section) =>
    getRequirementSectionProgress(section, completedCourses)
  );
  const totalCompleted = sectionProgress.reduce((sum, progress) => sum + progress.completed, 0);
  const totalCourses = sectionProgress.reduce((sum, progress) => sum + progress.total, 0);
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

      {!loading && !error && activeTab === "major" && requirementPaths.length > 1 && (
        <RequirementPathSelector
          paths={requirementPaths}
          selectedPath={selectedRequirementPath}
          onSelectPath={setSelectedRequirementPath}
        />
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
                  onCourseInfo={openCourseDetail}
                  requirementPaths={requirementPaths}
                  selectedRequirementPath={selectedRequirementPath}
                  onSelectRequirementPath={setSelectedRequirementPath}
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
            programName={programName}
            requirements={requirements}
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

      <CourseDetailModal
        section={detailSection}
        onClose={() => setDetailSection(null)}
      />

      {/* Footer */}
      <div className="border-t border-gray-200 dark:border-slate-800 bg-gray-50 dark:bg-slate-900 px-4 py-2.5">
        <p className="text-xs text-gray-500 dark:text-slate-400">
          {activeTab === "major"
            ? "Check off courses. Changes sync with the AI advisor."
            : "GE progress updates as you check off courses."}
        </p>
        <p className="mt-1 text-[11px] leading-5 text-gray-400 dark:text-slate-500">
          {UNOFFICIAL_DEGREE_NOTICE}
        </p>
      </div>
    </div>
  );
}
