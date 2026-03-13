"use client";

import { useState, useEffect } from "react";
import { generateSchedule } from "@/lib/schedule-generator";
import { isEligible } from "@/lib/eligibility";
import type { Section, StudentContext, RequirementSection } from "@/lib/course-data";

interface AutoGenerateModalProps {
  open: boolean;
  onClose: () => void;
  onApply: (sections: Section[]) => void;
  studentContext: StudentContext;
}

interface CourseMinimal {
  ge_areas: string[];
  units: number | string;
  prerequisites: string;
}

interface ProgramResponse {
  requirements: RequirementSection[];
  ge: {
    categories: any[];
    notes: string[];
    courseInfoMap: Record<string, CourseMinimal>;
  };
}

export function AutoGenerateModal({ open, onClose, onApply, studentContext }: AutoGenerateModalProps) {
  const [loading, setLoading] = useState(false);
  const [fetchingReqs, setFetchingReqs] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<Section[] | null>(null);
  const [pools, setPools] = useState<{ major: string[]; ge: string[]; discovery: string[] }>({
    major: [],
    ge: [],
    discovery: [],
  });
  const [priorities, setPriorities] = useState({
    major: true,
    ge: true,
    discovery: true,
  });
  const [geGroups, setGeGroups] = useState<Record<string, string[]>>({});

  useEffect(() => {
    if (open && studentContext.major) {
      const fetchRequirements = async () => {
        setFetchingReqs(true);
        setError("");
        try {
          const res = await fetch(`/api/data/program?name=${encodeURIComponent(studentContext.major!)}`);
          if (!res.ok) throw new Error("Failed to load");
          const data: ProgramResponse = await res.json();
          

          // 1. Major Pool
          const allRequired = new Set<string>();
          for (const req of data.requirements) {
            for (const course of req.courses) {
              allRequired.add(course.trim());
            }
          }
          const majorUncompleted = Array.from(allRequired).filter(
            (code) => !studentContext.completedCourses.includes(code) && 
                      isEligible(code, studentContext.completedCourses, data.ge.courseInfoMap, studentContext.year || "")
          );

          // 2. GE Pool (Topical Breadth gaps)
          const gePool: string[] = [];
          const groups: Record<string, string[]> = {
            AH: [],
            SS: [],
            SE: [],
          };

          Object.entries(data.ge.courseInfoMap).forEach(([code, info]: [string, any]) => {
            if (studentContext.completedCourses.includes(code)) return;
            if (!isEligible(code, studentContext.completedCourses, data.ge.courseInfoMap, studentContext.year || "")) return;
            
            info.ge_areas.forEach((area: string) => {
              if (['AH', 'SS', 'SE'].includes(area)) {
                if (!groups[area]) groups[area] = [];
                groups[area].push(code);
                if (!gePool.includes(code)) gePool.push(code);
              }
            });
          });

          // 3. Discovery Pool
          const discoveryPool = ["CMN 170V", "SOC 001", "PSC 001", "CHI 010", "CLA 030"].filter(
            (code) => !studentContext.completedCourses.includes(code) && 
                      isEligible(code, studentContext.completedCourses, data.ge.courseInfoMap, studentContext.year || "")
          );

          setPools({
            major: majorUncompleted,
            ge: gePool,
            discovery: discoveryPool,
          });
          setGeGroups(groups);
        } catch (e) {
          setError("Could not load your degree requirements.");
        } finally {
          setFetchingReqs(false);
        }
      };
      
      fetchRequirements();
    } else if (!open) {
      setResult(null);
      setError("");
    }
  }, [open, studentContext.major, studentContext.completedCourses]);

  const handleGenerate = async () => {
    if (!studentContext.major) {
      setError("Please set your major in your profile first.");
      return;
    }

    setLoading(true);
    setError("");
    setResult(null);

    const activePools = {
      major: priorities.major ? pools.major : [],
      ge: priorities.ge ? pools.ge : [],
      discovery: priorities.discovery ? pools.discovery : [],
    };

    const res = await generateSchedule({
      ...activePools,
      blockedTimes: studentContext.blockedTimes
    });

    if (res.error) {
      setError(res.error);
    } else {
      setResult(res.sections);
    }
    setLoading(false);
  };

  const handleApply = () => {
    if (result) {
      onApply(result);
      onClose();
      // Reset state
      setResult(null);
      setError("");
    }
  };

  if (!open) return null;

  const DAY_CODES_MAP: Record<string, string> = {
    Mon: "M", Tue: "Tu", Wed: "W", Thu: "Th", Fri: "F",
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-gray-200 dark:border-slate-700 max-h-[85vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-700 px-5 py-4">
          <div>
            <h3 className="text-base font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
              </svg>
              Auto-Generate Schedule
            </h3>
            <p className="text-xs text-gray-500 dark:text-slate-400 mt-0.5">
              Automatically build a conflict-free schedule from your remaining degree requirements.
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-800 transition-colors"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Active Constraints */}
          {studentContext.blockedTimes && studentContext.blockedTimes.length > 0 && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-100 dark:border-amber-500/30 px-3 py-2">
              <svg className="h-4 w-4 text-amber-600 dark:text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                Respecting {studentContext.blockedTimes.length} blocked time windows from your calendar.
              </span>
            </div>
          )}

          {/* Status Panel */}
          <div className="rounded-xl border border-gray-200 dark:border-slate-700 bg-gray-50 dark:bg-slate-800/50 p-4">
            {!studentContext.major ? (
              <p className="text-sm text-gray-600 dark:text-slate-300">
                You need to set a major in your profile first before we can auto-generate a schedule for you.
              </p>
            ) : fetchingReqs ? (
              <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-slate-300">
                <svg className="h-4 w-4 animate-spin text-[#002855]" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Analyzing your Degree Audit...
              </div>
            ) : (
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">
                  Customize your generation priorities
                </p>
                <div className="grid grid-cols-1 gap-3">
                  {/* Major Toggle */}
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-blue-100 dark:border-blue-900/30 bg-white dark:bg-slate-900 cursor-pointer hover:border-blue-200 transition-colors">
                    <input 
                      type="checkbox" 
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      checked={priorities.major}
                      onChange={(e) => setPriorities(prev => ({ ...prev, major: e.target.checked }))}
                    />
                    <div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">Major Requirements</span>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400">Core courses for {studentContext.major}. ({pools.major.length} remaining)</p>
                    </div>
                  </label>

                  {/* GE Toggle */}
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-amber-100 dark:border-amber-900/30 bg-white dark:bg-slate-900 cursor-pointer hover:border-amber-200 transition-colors">
                    <input 
                      type="checkbox" 
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                      checked={priorities.ge}
                      onChange={(e) => setPriorities(prev => ({ ...prev, ge: e.target.checked }))}
                    />
                    <div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">GE & Breadth Gaps</span>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400">Fulfills gaps in AH, SS, or SE areas. ({pools.ge.length} matches found)</p>
                    </div>
                  </label>

                  {/* Discovery Toggle */}
                  <label className="flex items-start gap-3 p-3 rounded-xl border border-purple-100 dark:border-purple-900/30 bg-white dark:bg-slate-900 cursor-pointer hover:border-purple-200 transition-colors">
                    <input 
                      type="checkbox" 
                      className="mt-1 h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                      checked={priorities.discovery}
                      onChange={(e) => setPriorities(prev => ({ ...prev, discovery: e.target.checked }))}
                    />
                    <div>
                      <span className="text-sm font-semibold text-gray-900 dark:text-white">Interesting Electives</span>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400">High-rated "discovery" courses and popular picks.</p>
                    </div>
                  </label>
                </div>
              </div>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
              {error}
            </div>
          )}

          {/* Result preview */}
          {result && (
            <div className="rounded-xl border border-green-200 dark:border-green-500/30 bg-green-50 dark:bg-green-500/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-green-800 dark:text-green-400 mb-2">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                Found a conflict-free schedule!
              </p>
              <div className="space-y-1.5">
                {result.map((s) => {
                  const meeting = s.meetings?.[0];
                  const days = meeting?.days?.map((d) => DAY_CODES_MAP[d] || d).join("") || "TBA";
                  const time = meeting?.startTime && meeting?.endTime ? `${meeting.startTime}–${meeting.endTime}` : "TBA";
                  return (
                    <div key={s.crn} className="flex items-center justify-between text-xs">
                      <span className="font-medium text-gray-800 dark:text-slate-200">{s.courseCode}</span>
                      <span className="text-gray-500 dark:text-slate-400">{days} {time}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-slate-700 px-5 py-3 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-200 dark:border-slate-600 px-4 py-2 text-sm font-medium text-gray-700 dark:text-slate-300 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          {result ? (
            <button
              onClick={handleApply}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 transition-colors"
            >
              Apply Schedule
            </button>
          ) : (
            <button
              onClick={handleGenerate}
              disabled={loading || fetchingReqs || !studentContext.major || (!priorities.major && !priorities.ge && !priorities.discovery)}
              className="rounded-lg bg-[#002855] px-4 py-2 text-sm font-medium text-white hover:bg-[#001a3a] disabled:opacity-50 transition-colors flex items-center gap-1.5"
            >
              {loading ? (
                <>
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Generating...
                </>
              ) : (
                <>
                  <svg className="h-4 w-4 mr-1.5 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 00-2.456 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
                  </svg>
                  Generate
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
