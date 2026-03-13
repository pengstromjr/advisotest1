"use client";

import { useEffect, useMemo, useState } from "react";
import type { Section } from "@/lib/course-data";
import { PrerequisiteChain } from "@/components/prerequisite-chain";
import { GPABadge } from "./gpa-display";

const TERM = "Spring Quarter 2026";
const PAGE_SIZE = 100;

const GE_OPTIONS = [
  { id: "AH", label: "Arts & Hum", group: "Topical Breadth" },
  { id: "SE", label: "Sci & Eng", group: "Topical Breadth" },
  { id: "SS", label: "Social Sci", group: "Topical Breadth" },
  { id: "ACGH", label: "Amer Cultr,Gov,Hist", group: "Core Literacies" },
  { id: "DD", label: "Domestic Diversity", group: "Core Literacies" },
  { id: "OL", label: "Oral Lit", group: "Core Literacies" },
  { id: "QL", label: "Quantitative Lit", group: "Core Literacies" },
  { id: "SL", label: "Scientific Lit", group: "Core Literacies" },
  { id: "VL", label: "Visual Lit", group: "Core Literacies" },
  { id: "WC", label: "World Cultr", group: "Core Literacies" },
  { id: "WE", label: "Writing Exp", group: "Core Literacies" },
];

const DAYS = ["M", "Tu", "W", "Th", "F"];

function formatMeeting(m: Section["meetings"][number]) {
  const days = m.days?.length ? m.days.join("") : "";
  const time =
    m.startTime && m.endTime ? `${m.startTime}–${m.endTime}` : "";
  const where = m.location ? m.location : "TBA";
  if (!days && !time) return where;
  if (!days) return `${time} · ${where}`;
  if (!time) return `${days} · ${where}`;
  return `${days} ${time} · ${where}`;
}

function RMPBadge({ rating, legacyId }: { 
  rating: number; 
  legacyId: string;
}) {
  const color = rating >= 4 ? "bg-green-100 text-green-700 border-green-200" : 
                rating >= 3 ? "bg-amber-100 text-amber-700 border-amber-200" : 
                "bg-red-100 text-red-700 border-red-200";
  
  return (
    <div className="group relative inline-block ml-1">
      <a 
        href={`https://www.ratemyprofessors.com/professor/${legacyId}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold transition-transform hover:scale-110 shadow-sm ${color}`}
        onClick={(e) => e.stopPropagation()}
      >
        <span>{rating.toFixed(1)}</span>
        <span className="opacity-60 text-[8px]">★</span>
      </a>
    </div>
  );
}


function InstructorInfo({ inst, rmpData, isLast }: { inst: string; rmpData?: any; isLast: boolean }) {
  if (!rmpData || inst === "The Faculty") return <span>{inst}{!isLast && ","}</span>;

  const rating = rmpData.avgRating;
  const distribution = rmpData.grades?.distribution;
  
  return (
    <div className="group relative inline-flex items-center">
      <span className="hover:text-blue-600 cursor-help transition-colors">{inst}{!isLast && ","}</span>
      <RMPBadge 
        rating={rmpData.avgRating}
        legacyId={rmpData.legacyId}
      />
      {rmpData.grades?.avgGpa && (
        <GPABadge gpa={rmpData.grades.avgGpa} />
      ) }

      {/* Unified Tooltip */}
      <div className="invisible group-hover:visible absolute bottom-full left-1/2 mb-3 w-64 -translate-x-1/2 rounded-xl border border-gray-200 bg-white p-4 shadow-2xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 dark:bg-slate-800 dark:border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <div className="flex flex-col">
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Instructor Insights</span>
            <span className="text-xs font-bold text-gray-900 dark:text-white">{inst}</span>
          </div>
          <div className="text-right">
             <div className={`text-sm font-black ${rating >= 4 ? "text-green-500" : rating >= 3 ? "text-amber-500" : "text-red-500"}`}>
              {rating.toFixed(1)} / 5
            </div>
            <div className="text-[9px] text-gray-400">RMP Rating</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-lg bg-gray-50 dark:bg-slate-900/50 p-2 text-center">
            <div className="text-[10px] text-gray-500 dark:text-slate-400">Difficulty</div>
            <div className="text-xs font-bold text-gray-900 dark:text-white">{rmpData.avgDifficulty.toFixed(1)}</div>
          </div>
          <div className="rounded-lg bg-gray-50 dark:bg-slate-900/50 p-2 text-center">
            <div className="text-[10px] text-gray-500 dark:text-slate-400">Take Again</div>
            <div className="text-xs font-bold text-gray-900 dark:text-white">{rmpData.wouldTakeAgainPercent}%</div>
          </div>
        </div>

        {distribution && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Hist. Grade Dist.</span>
              <span className="text-[10px] font-bold text-blue-500">Avg: {rmpData.grades.avgGpa.toFixed(2)}</span>
            </div>
            <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100 dark:bg-slate-700">
              <div style={{ width: `${distribution.A}%` }} className="bg-green-500 h-full" title={`A: ${distribution.A}%`} />
              <div style={{ width: `${distribution.B}%` }} className="bg-blue-400 h-full" title={`B: ${distribution.B}%`} />
              <div style={{ width: `${distribution.C}%` }} className="bg-amber-400 h-full" title={`C: ${distribution.C}%`} />
              <div style={{ width: `${distribution.D}%` }} className="bg-orange-500 h-full" title={`D: ${distribution.D}%`} />
              <div style={{ width: `${distribution.F}%` }} className="bg-red-500 h-full" title={`F: ${distribution.F}%`} />
            </div>
            <div className="flex justify-between px-0.5">
              {['A','B','C','D','F'].map(label => (
                <div key={label} className="text-[8px] font-bold text-gray-400">{label}</div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 pt-3 border-t border-gray-100 dark:border-slate-700 text-[10px] text-center text-blue-500 font-semibold group-hover:underline">
          View RateMyProfessor Profile →
        </div>
      </div>
    </div>
  );
}

export function ScheduleSearchModal({
  open,
  onClose,
  initialQuery,
  initialSubject,
  initialOpenOnly,
  onAddSection,
  plannedCrns,
  completedCourses,
  mode = "add",
  swapCourseFilter,
  onPickSection,
}: {
  open: boolean;
  onClose: () => void;
  initialQuery: string;
  initialSubject: string;
  initialOpenOnly: boolean;
  onAddSection?: (section: Section) => void;
  plannedCrns: Set<string>;
  completedCourses?: string[];
  mode?: "add" | "swap";
  swapCourseFilter?: {
    subject: string;
    courseNumber: string;
    courseCode: string;
    fromCrn: string;
  };
  onPickSection?: (section: Section) => void;
}) {
  // --- Search State ---
  const [query, setQuery] = useState(initialQuery);
  const [subject, setSubject] = useState(initialSubject);
  const [openOnly, setOpenOnly] = useState(initialOpenOnly);
  const [level, setLevel] = useState("All");
  const [units, setUnits] = useState("All");
  
  const [selectedDays, setSelectedDays] = useState<string[]>([]);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [selectedGEs, setSelectedGEs] = useState<string[]>([]);

  const [subjects, setSubjects] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(true);

  // --- Results State ---
  const [results, setResults] = useState<Section[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setQuery(initialQuery);
    setSubject(initialSubject);
    setOpenOnly(initialOpenOnly);
    setLevel("All");
    setUnits("All");
    setSelectedDays([]);
    setStartTime("");
    setEndTime("");
    setSelectedGEs([]);
    
    setResults([]);
    setTotal(0);
    setError("");
  }, [open, initialQuery, initialSubject, initialOpenOnly]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/sections/subjects")
      .then((r) => r.json())
      .then((data: { subjects?: string[] }) => {
        if (cancelled) return;
        if (Array.isArray(data.subjects)) setSubjects(data.subjects);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  const canLoadMore =
    mode !== "swap" &&
    !loading &&
    !loadingMore &&
    results.length > 0 &&
    results.length < total;

  const handleClear = () => {
    setQuery("");
    setSubject("");
    setLevel("All");
    setUnits("All");
    setSelectedDays([]);
    setStartTime("");
    setEndTime("");
    setSelectedGEs([]);
    setOpenOnly(false);
    setResults([]);
    setTotal(0);
  };

  const runSearch = async (
    append: boolean,
    overrides?: { q?: string; subj?: string },
  ) => {
    if (mode === "swap") append = false;
    const offset = append ? results.length : 0;
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");

    try {
      const params = new URLSearchParams();
      params.set("term", TERM);
      params.set("limit", String(mode === "swap" ? 200 : PAGE_SIZE));
      params.set("offset", String(offset));
      
      const effectiveQuery = overrides?.q ?? query;
      const effectiveSubject = overrides?.subj ?? subject;
      const trimmed = effectiveQuery.trim();
      
      if (trimmed) params.set("q", trimmed);
      if (effectiveSubject && mode !== "swap") params.set("subject", effectiveSubject);
      if (openOnly) params.set("open", "true");
      
      if (level && level !== "All") params.append("level", level);
      if (units && units !== "All") params.set("units", units);
      if (selectedGEs.length > 0) params.set("ge", selectedGEs.join(","));
      if (selectedDays.length > 0) params.set("days", selectedDays.join(","));
      if (startTime) params.set("startTime", startTime);
      if (endTime) params.set("endTime", endTime);

      const res = await fetch(`/api/sections?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to search");
      const data = (await res.json()) as {
        sections?: Section[];
        total?: number;
      };
      let list = Array.isArray(data.sections) ? data.sections : [];
      if (swapCourseFilter) {
        list = list.filter(
          (s) =>
            s.subject === swapCourseFilter.subject &&
            s.courseNumber === swapCourseFilter.courseNumber
        );
      }

      const nextTotal =
        mode === "swap"
          ? list.length
          : typeof data.total === "number"
            ? data.total
            : list.length;
      setTotal(nextTotal);
      if (append) setResults((prev) => [...prev, ...list]);
      else setResults(list);
    } catch {
      setError("Could not load sections. Please try again.");
      if (!append) setResults([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Auto-run once on open, passing initial values to avoid stale-closure reads
  useEffect(() => {
    if (!open) return;
    runSearch(false, { q: initialQuery, subj: initialSubject });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const summary = useMemo(() => {
    if (loading) return "Searching…";
    if (results.length === 0 && !error) return "No results yet.";
    if (total > results.length) {
      return `Showing ${results.length} of ${total.toLocaleString()} sections`;
    }
    return `Showing ${results.length} sections`;
  }, [loading, results.length, total, error]);

  const toggleDay = (day: string) => {
    setSelectedDays(prev => 
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    );
  };

  const toggleGE = (geId: string) => {
    setSelectedGEs(prev => 
      prev.includes(geId) ? prev.filter(g => g !== geId) : [...prev, geId]
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Scrim */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 mx-4 w-full max-w-[900px] flex flex-col max-h-[90vh] overflow-hidden rounded-2xl border border-gray-200 dark:border-slate-700 bg-[#f7f9fc] dark:bg-slate-900 shadow-2xl">
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-6 py-4">
          <div>
            <h2 className="text-xl font-bold text-[#002855] dark:text-white">
              {mode === "swap" ? "Swap Section" : "Add / Search Courses"}
            </h2>
            <p className="mt-0.5 text-xs text-gray-500 dark:text-slate-400">{summary}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 dark:hover:bg-slate-700 hover:text-gray-600 dark:hover:text-slate-200"
            aria-label="Close"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Advanced Search Form */}
          <div className="p-6">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                runSearch(false);
              }}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-6">
                
                {/* LEFT COLUMN */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#002855] dark:text-[#DAAA00] mb-1.5">
                      Search for courses by CRN, subject, instructor last name, or keyword:
                    </label>
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="e.g. 52970"
                      className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-[#002855] focus:ring-1 focus:ring-[#002855] dark:text-white"
                    />
                  </div>

                  {mode !== "swap" && (
                    <div>
                      <label className="block text-xs font-bold text-[#002855] dark:text-[#DAAA00] mb-1.5">
                        Subject:
                      </label>
                      <select
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-[#002855] focus:ring-1 focus:ring-[#002855] dark:text-white"
                      >
                        <option value="">- All subjects -</option>
                        {subjects.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-bold text-[#002855] dark:text-[#DAAA00] mb-1.5">
                      Course Level:
                    </label>
                    <select
                      value={level}
                      onChange={(e) => setLevel(e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-[#002855] focus:ring-1 focus:ring-[#002855] dark:text-white"
                    >
                      <option value="All">- All Levels -</option>
                      <option value="Lower">Lower Division (001-099)</option>
                      <option value="Upper">Upper Division (100-199)</option>
                      <option value="Grad">Graduate (200+)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#002855] dark:text-[#DAAA00] mb-1.5">
                      Units:
                    </label>
                    <select
                      value={units}
                      onChange={(e) => setUnits(e.target.value)}
                      className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-[#002855] focus:ring-1 focus:ring-[#002855] dark:text-white"
                    >
                      <option value="All">- All Units -</option>
                      <option value="1">1 Unit</option>
                      <option value="2">2 Units</option>
                      <option value="3">3 Units</option>
                      <option value="4">4 Units</option>
                      <option value="5+">5+ Units</option>
                    </select>
                  </div>
                </div>

                {/* RIGHT COLUMN */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#002855] dark:text-[#DAAA00] mb-1.5">
                      Meeting on:
                    </label>
                    <div className="flex items-center gap-3 bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 rounded-md px-3 py-2 h-[38px]">
                      {["Mon", "Tue", "Wed", "Thu", "Fri"].map((dayFull, i) => {
                        const code = DAYS[i];
                        return (
                          <label key={code} className="flex items-center gap-1.5 text-xs text-gray-700 dark:text-slate-300">
                            <input
                              type="checkbox"
                              checked={selectedDays.includes(code)}
                              onChange={() => toggleDay(code)}
                              className="w-3.5 h-3.5 rounded border-gray-300 text-[#002855] focus:ring-[#002855]"
                            />
                            {dayFull}
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-[#002855] dark:text-[#DAAA00] mb-1.5">
                        Starting At:
                      </label>
                      <input
                        type="time"
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                        className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-[#002855] focus:ring-1 focus:ring-[#002855] dark:text-white"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs font-bold text-[#002855] dark:text-[#DAAA00] mb-1.5">
                        Ending At:
                      </label>
                      <input
                        type="time"
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                        className="w-full rounded-md border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm outline-none focus:border-[#002855] focus:ring-1 focus:ring-[#002855] dark:text-white"
                      />
                    </div>
                  </div>
                  
                  <div className="pt-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-slate-200">
                      <input
                        type="checkbox"
                        checked={openOnly}
                        onChange={(e) => setOpenOnly(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-300 text-[#002855] focus:ring-[#002855]"
                      />
                      Show open sections only
                    </label>
                  </div>
                </div>
              </div>

              {/* GE OPTIONS - FULL WIDTH */}
              {showAdvanced && (
                <div className="mt-8 border-t border-gray-300 dark:border-slate-600 pt-6">
                  <h4 className="text-xs font-bold text-[#002855] dark:text-[#DAAA00] mb-3">GE Options:</h4>
                  
                  <div className="bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 p-4 rounded-md">
                    {/* Topical Breadth */}
                    <p className="text-xs font-semibold text-gray-900 dark:text-slate-200 border-b border-dashed border-gray-300 dark:border-slate-600 pb-1 mb-2">
                      Topical Breadth:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
                      {GE_OPTIONS.filter(g => g.group === "Topical Breadth").map(ge => (
                        <label key={ge.id} className="flex items-center gap-2 text-xs text-gray-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={selectedGEs.includes(ge.id)}
                            onChange={() => toggleGE(ge.id)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-[#002855] focus:ring-[#002855]"
                          />
                          <span className="font-bold">{ge.id}</span> ({ge.label})
                        </label>
                      ))}
                    </div>

                    {/* Core Literacies */}
                    <p className="text-xs font-semibold text-gray-900 dark:text-slate-200 border-b border-dashed border-gray-300 dark:border-slate-600 pb-1 mb-2">
                      Core Literacies:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {GE_OPTIONS.filter(g => g.group === "Core Literacies").map(ge => (
                        <label key={ge.id} className="flex items-center gap-2 text-xs text-gray-700 dark:text-slate-300">
                          <input
                            type="checkbox"
                            checked={selectedGEs.includes(ge.id)}
                            onChange={() => toggleGE(ge.id)}
                            className="w-3.5 h-3.5 rounded border-gray-300 text-[#002855] focus:ring-[#002855]"
                          />
                          <span className="font-bold">{ge.id}</span> ({ge.label})
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ACTION BUTTONS */}
              <div className="mt-6 flex justify-center gap-2 border-b border-gray-200 dark:border-slate-700 pb-4">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded bg-white dark:bg-slate-800 border border-gray-300 dark:border-slate-600 px-4 py-1.5 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700"
                >
                  Clear
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded bg-[#002855] px-6 py-1.5 text-sm font-semibold text-white hover:bg-[#001a3a] disabled:opacity-50 shadow-sm"
                >
                  {loading ? "Searching..." : "Search"}
                </button>
              </div>
              
              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs text-[#002855] dark:text-[#DAAA00] hover:underline"
                >
                  {showAdvanced ? "Hide Advanced Options" : "Show Advanced Options"}
                </button>
              </div>

            </form>
          </div>

          {/* RESULTS AREA */}
          <div className="bg-white dark:bg-slate-900 px-6 py-6 pb-12 border-t border-gray-200 dark:border-slate-700">
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 dark:bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                {error}
              </div>
            )}

            {loading && results.length === 0 && (
              <div className="flex items-center justify-center text-sm text-gray-500 dark:text-slate-400">
                <span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-[#002855] border-t-transparent" />
                Searching…
              </div>
            )}

            {!loading && results.length === 0 && !error && (
              <div className="rounded-xl border border-dashed border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 px-4 py-8 text-center">
                <p className="text-sm font-medium text-gray-700 dark:text-slate-300">
                  No sections found.
                </p>
                <p className="mt-1 text-sm text-gray-500 dark:text-slate-400">
                  Try broadening your search criteria.
                </p>
              </div>
            )}

            {!loading && results.length > 0 && (
              <div className="space-y-3">
                {results.map((s) => {
                  const already = plannedCrns.has(s.crn);
                  const isFrom = mode === "swap" && swapCourseFilter?.fromCrn === s.crn;
                  const disabled = already || isFrom;
                  const meetings =
                    s.meetings?.length > 0
                      ? s.meetings.map(formatMeeting)
                      : ["TBA"];
                  const instructors =
                    s.instructors?.length > 0 ? s.instructors.join(", ") : "TBA";
                  const seats =
                    s.seatsAvailable != null && s.seatsTotal != null
                      ? `${s.seatsAvailable}/${s.seatsTotal} seats`
                      : "Seats not listed";

                  return (
                    <div
                      key={s.crn}
                      className="rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4 shadow-sm"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                            {s.courseCode}{" "}
                            {s.section && (
                              <span className="text-gray-500 dark:text-slate-400 font-normal">
                                ({s.section})
                              </span>
                            )}
                            <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-slate-700 text-gray-600 dark:text-slate-300 text-[10px] uppercase block lg:inline">
                              {s.units} Units
                            </span>
                          </p>
                          <p className="mt-0.5 text-sm text-[#002855] dark:text-[#DAAA00] font-medium">
                            {s.title}
                          </p>
                          <div className="mt-3 space-y-1.5 text-xs text-gray-600 dark:text-slate-300">
                             <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                               <span className="font-semibold text-gray-700 dark:text-slate-200">
                                 Instructors:
                               </span>{" "}
                               {s.instructors?.length > 0 ? (
                                 s.instructors.map((inst, i) => (
                                   <InstructorInfo 
                                     key={inst} 
                                     inst={inst} 
                                     rmpData={s.rmp?.[inst]} 
                                     isLast={i === s.instructors.length - 1} 
                                   />
                                 ))
                               ) : "The Faculty"}
                             </div>
                            <p>
                              <span className="font-semibold text-gray-700 dark:text-slate-200">
                                Meetings:
                              </span>{" "}
                              {meetings.join("; ")}
                            </p>
                            <p>
                              <span className="font-semibold text-gray-700 dark:text-slate-200">
                                Seats:
                              </span>{" "}
                              <span className={s.seatsAvailable && s.seatsAvailable > 0 ? "text-green-600 dark:text-green-400 font-medium" : "text-red-500"}>
                                {seats}
                              </span>
                            </p>
                          </div>

                          <div className="mt-3 pt-3 border-t border-gray-100 dark:border-slate-700">
                            <PrerequisiteChain
                              courseCode={s.courseCode}
                              completedCourses={completedCourses}
                            />
                          </div>
                        </div>

                        <div className="shrink-0 text-right sm:w-40 flex flex-col justify-between">
                          <p className="text-xs text-gray-500 dark:text-slate-400 font-mono bg-gray-50 dark:bg-slate-900 px-2 py-1 rounded inline-block mb-3 sm:mb-0">
                            CRN: {s.crn}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              if (mode === "swap") onPickSection?.(s);
                              else onAddSection?.(s);
                            }}
                            disabled={disabled || (mode === "swap" ? !onPickSection : !onAddSection)}
                            className="w-full mt-auto inline-flex items-center justify-center rounded-lg bg-[#002855] dark:bg-[#DAAA00] px-3 py-2 text-sm font-semibold text-white dark:text-[#002855] hover:bg-[#001a3a] dark:hover:bg-[#c49900] disabled:cursor-not-allowed disabled:bg-gray-300 dark:disabled:bg-slate-700 disabled:text-gray-500 transition-colors"
                          >
                            {disabled
                              ? isFrom
                                ? "Current"
                                : "In schedule"
                              : mode === "swap"
                                ? "Swap"
                                : "Add course"}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {canLoadMore && (
                  <button
                    type="button"
                    onClick={() => runSearch(true)}
                    disabled={loadingMore}
                    className="w-full rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 px-4 py-3 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-100 dark:hover:bg-slate-700 disabled:opacity-50 transition-colors"
                  >
                    {loadingMore
                      ? "Loading…"
                      : `Load more (${(total - results.length).toLocaleString()} left)`}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
