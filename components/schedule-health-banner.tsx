
import React from "react";
import { ScheduleHealth, ScheduleConflict } from "@/lib/schedule-utils";
import { AlertCircle, AlertTriangle, CheckCircle2, Info, ChevronDown, ChevronUp } from "lucide-react";

interface ScheduleHealthBannerProps {
  health: ScheduleHealth;
}

export function ScheduleHealthBanner({ health }: ScheduleHealthBannerProps) {
  const [expanded, setExpanded] = React.useState(false);

  const errors = health.conflicts.filter((c) => c.severity === "error");
  const warnings = health.conflicts.filter((c) => c.severity === "warning");

  if (health.conflicts.length === 0) {
    return (
      <div className="mb-4 flex items-center justify-between rounded-xl border border-green-100 bg-green-50/50 px-4 py-3 dark:border-green-900/30 dark:bg-green-900/10">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-green-900 dark:text-green-300">Schedule looks great!</p>
            <p className="text-xs text-green-700 dark:text-green-500">No time conflicts or prerequisite issues found.</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold uppercase tracking-wider text-green-600 dark:text-green-500">Total Units</p>
          <p className="text-lg font-black text-green-900 dark:text-green-300">{health.totalUnits}</p>
        </div>
      </div>
    );
  }

  const mainStatus = errors.length > 0 ? "error" : "warning";

  return (
    <div className={`mb-4 overflow-hidden rounded-xl border transition-all duration-300 ${
      mainStatus === "error" 
        ? "border-red-200 bg-red-50/50 dark:border-red-900/30 dark:bg-red-900/10" 
        : "border-amber-200 bg-amber-50/50 dark:border-amber-900/30 dark:bg-amber-900/10"
    }`}>
      <div 
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`flex h-9 w-9 items-center justify-center rounded-full ${
            mainStatus === "error" 
              ? "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400" 
              : "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400"
          }`}>
            {mainStatus === "error" ? <AlertCircle className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <p className={`text-sm font-bold ${mainStatus === "error" ? "text-red-900 dark:text-red-300" : "text-amber-900 dark:text-amber-300"}`}>
                Schedule Health Alert
              </p>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                mainStatus === "error" ? "bg-red-100 text-red-700 dark:bg-red-900/60" : "bg-amber-100 text-amber-700 dark:bg-amber-900/60"
              }`}>
                {errors.length} Errors • {warnings.length} Tips
              </span>
            </div>
            <p className={`text-xs ${mainStatus === "error" ? "text-red-700 dark:text-red-400" : "text-amber-700 dark:text-amber-400"}`}>
              {errors.length > 0 ? errors[0].message : warnings[0].message}
              {health.conflicts.length > 1 && ` and ${health.conflicts.length - 1} more issues.`}
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className={`text-[9px] font-bold uppercase tracking-wider ${mainStatus === "error" ? "text-red-500" : "text-amber-600"}`}>Quarter Units</p>
            <p className={`text-lg font-black leading-none ${mainStatus === "error" ? "text-red-900 dark:text-red-300" : "text-amber-900 dark:text-amber-300"}`}>{health.totalUnits}</p>
          </div>
          <div className={`rounded-lg p-1 ${mainStatus === "error" ? "hover:bg-red-100 dark:hover:bg-red-900/40" : "hover:bg-amber-100 dark:hover:bg-amber-900/40"}`}>
            {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
          </div>
        </div>
      </div>

      {expanded && (
        <div className={`border-t px-4 py-3 space-y-3 ${
          mainStatus === "error" ? "border-red-100 dark:border-red-900/20" : "border-amber-100 dark:border-amber-900/20"
        }`}>
          {health.conflicts.map((conflict, i) => (
            <div key={i} className="flex items-start gap-3">
              <div className="mt-0.5">
                {conflict.severity === "error" 
                  ? <AlertCircle className="h-4 w-4 text-red-500" /> 
                  : <AlertTriangle className="h-4 w-4 text-amber-500" />}
              </div>
              <div className="flex-1">
                <p className={`text-xs font-bold ${conflict.severity === "error" ? "text-red-900 dark:text-red-200" : "text-amber-900 dark:text-amber-200"}`}>
                  {conflict.type === "time" ? "Time Conflict" : conflict.type === "prerequisite" ? "Prerequisite Missing" : "Load Alert"}
                </p>
                <p className="text-[11px] text-gray-600 dark:text-gray-400">{conflict.message}</p>
              </div>
              {conflict.courseCode && (
                <div className="rounded bg-white/50 px-2 py-0.5 text-[10px] font-medium dark:bg-black/20">
                  {conflict.courseCode}
                </div>
              )}
            </div>
          ))}
          
          <div className="pt-2">
            <button className="w-full rounded-lg bg-white/40 py-2 text-[11px] font-bold uppercase tracking-wider text-gray-700 shadow-sm transition-all hover:bg-white/60 dark:bg-white/5 dark:text-gray-300 dark:hover:bg-white/10">
              Ask AI to Fix Schedule
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
