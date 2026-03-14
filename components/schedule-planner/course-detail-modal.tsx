"use client";

import { useState, useEffect } from "react";
import type { Section } from "@/lib/course-data";
import { dispatchScheduleAdd } from "@/lib/schedule-store";
import { getStoredPlannedSections, getStoredBlockedTimes, checkTimeConflict } from "@/lib/schedule-state";
import {
  X, MapPin, Clock, Users, BookOpen, Star, BarChart3, TrendingUp, ExternalLink, Check, AlertCircle,
} from "lucide-react";

interface GradeData {
  overall_gpa: number | null;
  overall_grades: Record<string, number>;
  overall_enrolled: number;
  professors: {
    name: string;
    slug: string;
    totalGpa: number | null;
    totalEnrolled: number;
    totalGrades: Record<string, number>;
  }[];
}

interface CourseInfo {
  code: string;
  title: string;
  units: string | number;
  description: string;
  prerequisites: string | string[];
  ge_areas: string[];
}

interface CourseDetailModalProps {
  section: Section | null;
  onClose: () => void;
}

const GRADE_COLORS: Record<string, string> = {
  "A+": "#22c55e", A: "#22c55e", "A-": "#4ade80",
  "B+": "#3b82f6", B: "#3b82f6", "B-": "#60a5fa",
  "C+": "#f59e0b", C: "#f59e0b", "C-": "#fbbf24",
  "D+": "#f97316", D: "#f97316", "D-": "#fb923c",
  F: "#ef4444",
  "P*": "#8b5cf6", "NP*": "#a78bfa",
};

const LETTER_GRADES = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D+", "D", "D-", "F"];

function GradeBar({ label, count, maxCount, color }: { label: string; count: number; maxCount: number; color: string }) {
  const pct = maxCount > 0 ? (count / maxCount) * 100 : 0;
  return (
    <div className="flex items-center gap-2 group">
      <span className="w-6 text-right text-[10px] font-bold text-gray-400 dark:text-slate-500">{label}</span>
      <div className="flex-1 h-5 bg-gray-100 dark:bg-slate-800 rounded-md overflow-hidden relative">
        <div
          className="h-full rounded-md transition-all duration-500 ease-out"
          style={{ width: `${Math.max(pct, 0.5)}%`, backgroundColor: color }}
        />
        {count > 0 && (
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-gray-500 dark:text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity">
            {count}
          </span>
        )}
      </div>
      <span className="w-10 text-right text-[10px] font-semibold text-gray-500 dark:text-slate-400">
        {pct > 0 ? `${pct.toFixed(0)}%` : ""}
      </span>
    </div>
  );
}

function ProfessorCard({ prof, isHighlighted }: { prof: GradeData["professors"][0]; isHighlighted: boolean }) {
  const gpa = prof.totalGpa;
  const gpaColor = gpa == null ? "text-gray-400" :
    gpa >= 3.5 ? "text-green-500" :
    gpa >= 3.0 ? "text-blue-500" :
    gpa >= 2.5 ? "text-amber-500" : "text-red-500";

  return (
    <div className={`rounded-xl border p-3 transition-all ${
      isHighlighted
        ? "border-blue-400 dark:border-blue-500 bg-blue-50/50 dark:bg-blue-500/10 ring-1 ring-blue-400/30"
        : "border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800"
    }`}>
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-800 dark:text-white truncate">
          {prof.name}
          {isHighlighted && (
            <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded-full bg-blue-500 text-white font-bold">
              Current
            </span>
          )}
        </span>
        <div className="flex items-center gap-2">
          {gpa != null && (
            <span className={`text-sm font-black ${gpaColor}`}>{gpa.toFixed(2)}</span>
          )}
          {prof.totalEnrolled > 0 && (
            <span className="text-[9px] text-gray-400 dark:text-slate-500">
              {prof.totalEnrolled} students
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function CourseDetailModal({ section, onClose }: CourseDetailModalProps) {
  const [grades, setGrades] = useState<GradeData | null>(null);
  const [courseInfo, setCourseInfo] = useState<CourseInfo | null>(null);
  const [allSections, setAllSections] = useState<Section[]>([]);
  const [loading, setLoading] = useState(true);
  const [sectionsLoading, setSectionsLoading] = useState(true);

  useEffect(() => {
    if (!section) return;
    setLoading(true);
    setSectionsLoading(true);

    // Fetch grades and course info
    fetch(`/api/grades?course=${encodeURIComponent(section.courseCode)}`)
      .then((r) => r.json())
      .then((data) => {
        setGrades(data.grades);
        setCourseInfo(data.course);
      })
      .catch(() => {})
      .finally(() => setLoading(false));

    // Fetch all sections for the course
    fetch(`/api/sections?q=${encodeURIComponent(section.courseCode)}&open=true`)
      .then((r) => r.json())
      .then((data) => {
        setAllSections(data.sections || []);
      })
      .catch(() => {})
      .finally(() => setSectionsLoading(false));
  }, [section?.courseCode]);

  useEffect(() => {
    if (!section) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [section, onClose]);

  if (!section) return null;

  const rmpData = section.rmp?.[section.instructors[0]];
  const totalGraded = grades?.overall_grades
    ? LETTER_GRADES.reduce((sum, g) => sum + (grades.overall_grades[g] || 0), 0)
    : 0;
  const maxGradeCount = grades?.overall_grades
    ? Math.max(...LETTER_GRADES.map((g) => grades.overall_grades[g] || 0))
    : 0;

  // Find the current instructor in the professor list
  const instLastName = section.instructors[0]?.split(", ")[0]?.toLowerCase();
  const matchedProfIdx = grades?.professors?.findIndex((p) =>
    p.name?.toLowerCase().includes(instLastName || "___")
  ) ?? -1;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative z-10 mx-4 w-full max-w-[680px] max-h-[88vh] overflow-hidden rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl flex flex-col">
        {/* Header */}
        <div className="shrink-0 bg-gradient-to-r from-[#002855] to-[#003d7a] dark:from-[#001a3a] dark:to-[#002855] px-6 py-5 text-white relative overflow-hidden">
          <div className="absolute inset-0 opacity-5">
            <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-white" />
            <div className="absolute -left-4 -bottom-4 h-20 w-20 rounded-full bg-white" />
          </div>
          <div className="relative flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 mb-1">
                <h2 className="text-xl font-black tracking-tight">{section.courseCode}</h2>
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-[10px] font-bold backdrop-blur">
                  {section.units} Units
                </span>
              </div>
              <p className="text-sm font-medium text-white/90 line-clamp-2">{section.title}</p>
              {section.instructors[0] && section.instructors[0] !== "The Faculty" && (
                <p className="mt-2 text-xs text-white/70">
                  Instructor: <span className="text-white font-semibold">{section.instructors.join(", ")}</span>
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="shrink-0 flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-[#002855] border-t-transparent" />
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Quick Stats Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {grades?.overall_gpa != null && (
                  <div className="rounded-xl bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-500/10 dark:to-emerald-500/10 border border-green-200/50 dark:border-green-500/20 p-3 text-center">
                    <div className="text-[10px] font-bold text-green-600 dark:text-green-400 uppercase tracking-wider flex items-center justify-center gap-1">
                      <BarChart3 className="h-3 w-3" /> Avg GPA
                    </div>
                    <div className="text-2xl font-black text-green-700 dark:text-green-300 mt-1">{grades.overall_gpa.toFixed(2)}</div>
                  </div>
                )}
                {rmpData && (
                  <div className="rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-500/10 dark:to-indigo-500/10 border border-blue-200/50 dark:border-blue-500/20 p-3 text-center">
                    <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider flex items-center justify-center gap-1">
                      <Star className="h-3 w-3" /> RMP Rating
                    </div>
                    <div className="text-2xl font-black text-blue-700 dark:text-blue-300 mt-1">{rmpData.avgRating.toFixed(1)}</div>
                  </div>
                )}
                {rmpData && (
                  <div className="rounded-xl bg-gradient-to-br from-amber-50 to-orange-50 dark:from-amber-500/10 dark:to-orange-500/10 border border-amber-200/50 dark:border-amber-500/20 p-3 text-center">
                    <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider flex items-center justify-center gap-1">
                      <TrendingUp className="h-3 w-3" /> Difficulty
                    </div>
                    <div className="text-2xl font-black text-amber-700 dark:text-amber-300 mt-1">{rmpData.avgDifficulty.toFixed(1)}</div>
                  </div>
                )}
                {grades?.overall_enrolled != null && grades.overall_enrolled > 0 && (
                  <div className="rounded-xl bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-500/10 dark:to-violet-500/10 border border-purple-200/50 dark:border-purple-500/20 p-3 text-center">
                    <div className="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider flex items-center justify-center gap-1">
                      <Users className="h-3 w-3" /> Enrolled
                    </div>
                    <div className="text-2xl font-black text-purple-700 dark:text-purple-300 mt-1">{grades.overall_enrolled.toLocaleString()}</div>
                  </div>
                )}
              </div>

              {/* Course Description */}
              {courseInfo?.description && (
                <div>
                  <h3 className="text-xs font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <BookOpen className="h-3.5 w-3.5" /> Description
                  </h3>
                  <p className="text-sm text-gray-700 dark:text-slate-300 leading-relaxed">
                    {courseInfo.description}
                  </p>
                </div>
              )}

              {/* Prerequisites & GE */}
              {(courseInfo?.prerequisites || (courseInfo?.ge_areas && courseInfo.ge_areas.length > 0)) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {courseInfo.prerequisites && (
                    <div className="rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700 p-3">
                      <span className="text-[10px] font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider">Prerequisites</span>
                      <p className="text-xs text-gray-700 dark:text-slate-300 mt-1 font-medium">
                        {Array.isArray(courseInfo.prerequisites)
                          ? courseInfo.prerequisites.length > 0 ? courseInfo.prerequisites.join(", ") : "None"
                          : courseInfo.prerequisites || "None"}
                      </p>
                    </div>
                  )}
                  {courseInfo.ge_areas && courseInfo.ge_areas.length > 0 && (
                    <div className="rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700 p-3">
                      <span className="text-[10px] font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider">GE Areas</span>
                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                        {courseInfo.ge_areas.map((ge) => (
                          <span key={ge} className="rounded-full bg-[#002855]/10 dark:bg-blue-500/20 px-2 py-0.5 text-[10px] font-bold text-[#002855] dark:text-blue-400">
                            {ge}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Section Details - Original */}
              <div className="rounded-xl bg-gray-50 dark:bg-slate-800/50 border border-gray-100 dark:border-slate-700 p-4">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider">Current Selection</h3>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-400 text-[10px] font-mono">CRN: {section.crn}</span>
                    <span className="rounded-full bg-blue-500/10 dark:bg-blue-500/20 px-2 py-0.5 text-[9px] font-bold text-blue-600 dark:text-blue-400 border border-blue-500/20 capitalize">
                      {section.modality}
                    </span>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div className="flex items-start gap-2">
                    <Clock className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-gray-700 dark:text-slate-200">Schedule</span>
                      <div className="text-gray-500 dark:text-slate-400 mt-0.5">
                        {section.meetings.length > 0
                          ? section.meetings.map((m, i) => (
                              <div key={i}>{m.days.join("")} {m.startTime}–{m.endTime}</div>
                            ))
                          : "TBA"}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <MapPin className="h-3.5 w-3.5 text-gray-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold text-gray-700 dark:text-slate-200">Location</span>
                      <p className="text-gray-500 dark:text-slate-400 mt-0.5">
                        {section.meetings[0]?.location || "TBA"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Other Available Times */}
              {!sectionsLoading && allSections.length > 1 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" /> Other Available Times
                  </h3>
                  <div className="space-y-2">
                    {(() => {
                      const planned = getStoredPlannedSections();
                      const blocked = getStoredBlockedTimes();
                      
                      return allSections
                        .filter(s => s.crn !== section.crn)
                        .map((s) => {
                          const conflict = checkTimeConflict(s, planned, blocked);
                          const isAlreadyInSchedule = planned.some(p => p.crn === s.crn);
                          
                          return (
                            <div key={s.crn} className="flex items-center justify-between rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-800/50 p-3 transition-colors hover:border-blue-500/30">
                              <div className="flex flex-col gap-0.5 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-bold text-gray-800 dark:text-slate-200">Section {s.section}</span>
                                  {conflict && (
                                    <span className="flex items-center gap-0.5 text-[9px] font-bold text-amber-600 dark:text-amber-500">
                                      <AlertCircle className="h-2.5 w-2.5" /> Conflict
                                    </span>
                                  )}
                                  {isAlreadyInSchedule && (
                                    <span className="flex items-center gap-0.5 text-[9px] font-bold text-green-600 dark:text-green-500">
                                      <Check className="h-2.5 w-2.5" /> In Schedule
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-gray-500 dark:text-slate-400 flex items-center gap-2">
                                  <span>{s.meetings[0]?.days.join("")} {s.meetings[0]?.startTime}–{s.meetings[0]?.endTime}</span>
                                  <span className="text-gray-300 dark:text-slate-700">|</span>
                                  <span>CRN {s.crn}</span>
                                </div>
                              </div>
                              <button
                                disabled={isAlreadyInSchedule}
                                onClick={() => {
                                  dispatchScheduleAdd(s);
                                  onClose();
                                }}
                                className={`ml-3 shrink-0 rounded-lg px-3 py-1.5 text-[10px] font-bold transition-all ${
                                  isAlreadyInSchedule
                                    ? "bg-gray-100 dark:bg-slate-800 text-gray-400 cursor-default"
                                    : conflict
                                      ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-500 border border-amber-200/50 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                                      : "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400 border border-blue-200/50 dark:border-blue-500/20 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                                }`}
                              >
                                {isAlreadyInSchedule ? "Added" : "Select"}
                              </button>
                            </div>
                          );
                        });
                    })()}
                  </div>
                </div>
              )}

              {/* RMP Details */}
              {rmpData && (
                <div>
                  <h3 className="text-xs font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Star className="h-3.5 w-3.5" /> Rate My Professor — {section.instructors[0]}
                  </h3>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-3 text-center">
                      <div className="text-[10px] text-gray-500 dark:text-slate-400 font-bold uppercase">Rating</div>
                      <div className={`text-lg font-black mt-0.5 ${rmpData.avgRating >= 4 ? 'text-green-500' : rmpData.avgRating >= 3 ? 'text-amber-500' : 'text-red-500'}`}>
                        {rmpData.avgRating.toFixed(1)}/5
                      </div>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-3 text-center">
                      <div className="text-[10px] text-gray-500 dark:text-slate-400 font-bold uppercase">Would Take Again</div>
                      <div className="text-lg font-black text-blue-500 mt-0.5">
                        {rmpData.wouldTakeAgainPercent != null && rmpData.wouldTakeAgainPercent >= 0
                          ? `${rmpData.wouldTakeAgainPercent}%`
                          : "N/A"}
                      </div>
                    </div>
                    <div className="rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-700 p-3 text-center">
                      <div className="text-[10px] text-gray-500 dark:text-slate-400 font-bold uppercase">Reviews</div>
                      <div className="text-lg font-black text-gray-700 dark:text-slate-300 mt-0.5">{rmpData.numRatings}</div>
                    </div>
                  </div>
                  {rmpData.legacyId && (
                    <a
                      href={`https://www.ratemyprofessors.com/professor/${rmpData.legacyId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-flex items-center gap-1 text-[10px] text-blue-500 hover:text-blue-700 font-semibold"
                    >
                      View on RateMyProfessors <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              )}

              {/* Grade Distribution */}
              {grades?.overall_grades && totalGraded > 0 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-600 dark:text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <BarChart3 className="h-3.5 w-3.5" /> Grade Distribution
                    <span className="text-[9px] font-normal text-gray-500">({totalGraded.toLocaleString()} students)</span>
                  </h3>
                  <div className="space-y-1">
                    {LETTER_GRADES.map((g) => (
                      <GradeBar
                        key={g}
                        label={g}
                        count={grades.overall_grades[g] || 0}
                        maxCount={maxGradeCount}
                        color={GRADE_COLORS[g] || "#94a3b8"}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Professor Comparison */}
              {grades?.professors && grades.professors.filter((p) => p.totalGpa != null).length > 1 && (
                <div>
                  <h3 className="text-xs font-bold text-gray-600 dark:text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" /> Professors by GPA
                  </h3>
                  <div className="space-y-2">
                    {grades.professors
                      .filter((p) => p.totalGpa != null && p.totalEnrolled > 0)
                      .sort((a, b) => (b.totalGpa || 0) - (a.totalGpa || 0))
                      .map((prof, i) => (
                        <ProfessorCard
                          key={`${prof.slug || 'prof'}-${i}`}
                          prof={prof}
                          isHighlighted={
                            matchedProfIdx >= 0 &&
                            grades.professors[matchedProfIdx].slug === prof.slug
                          }
                        />
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 px-6 py-4 flex items-center justify-between">
          <button
            onClick={onClose}
            className="rounded-xl border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => {
              dispatchScheduleAdd(section);
              onClose();
            }}
            className="rounded-xl bg-[#002855] px-6 py-2.5 text-sm font-bold text-white shadow-lg shadow-blue-900/20 hover:bg-[#001a3a] transition-colors"
          >
            Add to Schedule
          </button>
        </div>
      </div>
    </div>
  );
}
