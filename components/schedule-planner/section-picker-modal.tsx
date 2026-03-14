"use client";

import { X, Clock, MapPin, Check, AlertCircle } from "lucide-react";
import type { Section } from "@/lib/course-data";
import { getStoredPlannedSections, getStoredBlockedTimes, checkTimeConflict } from "@/lib/schedule-state";
import { dispatchScheduleAdd } from "@/lib/schedule-store";

interface SectionPickerModalProps {
  courseCode: string;
  courseTitle: string;
  sections: Section[];
  onClose: () => void;
}

export function SectionPickerModal({ courseCode, courseTitle, sections, onClose }: SectionPickerModalProps) {
  const planned = getStoredPlannedSections();
  const blocked = getStoredBlockedTimes();

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-2xl animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 dark:border-slate-800 bg-gray-50/50 dark:bg-slate-800/50 px-6 py-4">
          <div>
            <h2 className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight">Select a Time</h2>
            <p className="text-[11px] font-medium text-gray-500 dark:text-slate-400 mt-0.5">{courseCode}: {courseTitle}</p>
          </div>
          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-gray-200 dark:hover:bg-slate-700 transition-colors"
          >
            <X className="h-4 w-4 text-gray-400" />
          </button>
        </div>

        {/* List */}
        <div className="max-h-[60vh] overflow-y-auto p-4 space-y-2">
          {sections.map((s) => {
            const conflict = checkTimeConflict(s, planned, blocked);
            const isAlreadyInSchedule = planned.some(p => p.crn === s.crn);
            
            return (
              <div 
                key={s.crn} 
                className={`flex items-center justify-between rounded-xl border p-3 transition-all ${
                  isAlreadyInSchedule 
                    ? "bg-green-50/50 dark:bg-green-500/5 border-green-200 dark:border-green-500/20" 
                    : "bg-white dark:bg-slate-800 border-gray-100 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-500"
                }`}
              >
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
                        <Check className="h-2.5 w-2.5" /> Enrolled
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-500 dark:text-slate-400 flex flex-col gap-0.5">
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-2.5 w-2.5" />
                      <span>{s.meetings[0]?.days.join("")} {s.meetings[0]?.startTime}–{s.meetings[0]?.endTime}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="h-2.5 w-2.5" />
                      <span className="truncate">{s.meetings[0]?.location || "TBA"}</span>
                    </div>
                  </div>
                </div>
                
                <button
                  disabled={isAlreadyInSchedule}
                  onClick={() => {
                    dispatchScheduleAdd(s);
                    onClose();
                  }}
                  className={`ml-4 shrink-0 rounded-lg px-4 py-2 text-[10px] font-bold transition-all ${
                    isAlreadyInSchedule
                      ? "bg-transparent text-green-600 dark:text-green-400 font-black"
                      : conflict
                        ? "bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-500 border border-amber-200/50 dark:border-amber-500/20 hover:bg-amber-100 dark:hover:bg-amber-900/30"
                        : "bg-blue-600 text-white shadow-lg shadow-blue-600/20 hover:bg-blue-700"
                  }`}
                >
                  {isAlreadyInSchedule ? <Check className="h-4 w-4" /> : "Select"}
                </button>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 dark:border-slate-800 bg-gray-50/30 dark:bg-slate-800/30 px-6 py-4">
          <p className="text-[10px] text-gray-400 dark:text-slate-500 text-center">
            Selection will be added to your spring schedule immediately.
          </p>
        </div>
      </div>
    </div>
  );
}
