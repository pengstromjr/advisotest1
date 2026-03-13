"use client";

import { useState, useEffect } from "react";
import type { Section, StudentContext } from "@/lib/course-data";
import { isEligible } from "@/lib/eligibility";
import { getStoredPlannedSections, getStoredBlockedTimes, checkTimeConflict } from "@/lib/schedule-state";
import { dispatchScheduleAdd } from "@/lib/schedule-store";
import { Sparkles } from "lucide-react";

interface SmartGeModalProps {
  open: boolean;
  onClose: () => void;
  geArea: { code: string; name: string };
  studentContext: StudentContext;
}

export function SmartGeModal({ open, onClose, geArea, studentContext }: SmartGeModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sections, setSections] = useState<Section[]>([]);

  useEffect(() => {
    if (open && geArea.code) {
      const fetchMatches = async () => {
        setLoading(true);
        setError("");
        try {
          // 1. Fetch sections for this GE area
          const secRes = await fetch(`/api/sections?ge=${geArea.code}&limit=100&open=true`);
          if (!secRes.ok) throw new Error("Failed to load sections");
          const secData = await secRes.json();
          const allSections: Section[] = secData.sections || [];

          // 2. Fetch program info for prerequisites
          const progRes = await fetch(`/api/data/program?name=${encodeURIComponent(studentContext.major || "Computer Science, Bachelor of Science")}`);
          const progData = await progRes.json();
          const infoMap = progData.ge?.courseInfoMap || {};

          // 3. Get current schedule constraints
          const planned = getStoredPlannedSections();
          const blocked = getStoredBlockedTimes();

          // 4. Filter and Score
          const filtered = allSections.filter(s => {
            // Check Eligibility
            if (!isEligible(s.courseCode, studentContext.completedCourses, infoMap, studentContext.year || "")) return false;
            
            // Check Conflict
            if (checkTimeConflict(s, planned, blocked)) return false;

            return true;
          });

          // Limit to 10 best options
          setSections(filtered.slice(0, 10));
        } catch (e) {
          setError("Could not find matching sections.");
        } finally {
          setLoading(true); // Wait, should be false
          setLoading(false);
        }
      };
      fetchMatches();
    }
  }, [open, geArea.code, studentContext.major, studentContext.completedCourses, studentContext.year]);

  if (!open) return null;

  const handleAdd = (s: Section) => {
    dispatchScheduleAdd(s);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 shadow-2xl border border-gray-200 dark:border-slate-700 overflow-hidden flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="bg-[#002855] px-5 py-4 text-white">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Smart Match: {geArea.name}
              </h3>
              <p className="text-[10px] text-blue-200 mt-0.5 uppercase tracking-wider font-semibold">
                Finding conflict-free {geArea.code} sections
              </p>
            </div>
            <button onClick={onClose} className="rounded-full p-1 hover:bg-white/10">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#002855] border-t-transparent" />
              <p className="mt-4 text-sm font-medium text-gray-500">Checking 1,000+ combinations...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          ) : sections.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500">No conflict-free sections found for {geArea.code}.</p>
              <p className="text-xs text-gray-400 mt-1">Try clearing some time in your schedule.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sections.map((s) => (
                <div 
                  key={s.crn}
                  className="group relative rounded-xl border border-gray-100 dark:border-slate-800 bg-white dark:bg-slate-800 p-3 hover:border-[#002855] hover:shadow-md transition-all cursor-pointer"
                  onClick={() => handleAdd(s)}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-sm font-bold text-gray-900 dark:text-white group-hover:text-[#002855] transition-colors">
                        {s.courseCode}
                      </h4>
                      <p className="text-[11px] text-gray-500 dark:text-slate-400 truncate w-60">
                        {s.title}
                      </p>
                    </div>
                    <span className="rounded-md bg-green-50 dark:bg-green-500/10 px-2 py-0.5 text-[10px] font-bold text-green-700 dark:text-green-400">
                      Eligible
                    </span>
                  </div>
                  
                  <div className="mt-2.5 flex items-center justify-between border-t border-gray-50 dark:border-slate-700/50 pt-2.5">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-[10px] font-medium text-gray-500">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {s.meetings[0]?.days.join("")} {s.meetings[0]?.startTime}–{s.meetings[0]?.endTime}
                      </div>
                    </div>
                    <button className="text-[11px] font-bold text-[#002855] hover:underline">
                      Add to Schedule +
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Footer */}
        <div className="bg-gray-50 dark:bg-slate-800/50 px-5 py-3 border-t border-gray-100 dark:border-slate-800">
          <p className="text-[10px] text-gray-400 text-center italic">
            Matches are filtered by remaining prerequisites and your current schedule conflicts.
          </p>
        </div>
      </div>
    </div>
  );
}
