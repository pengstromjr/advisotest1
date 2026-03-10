"use client";

import type { StudentContext } from "@/lib/course-data";

interface SchedulePlannerTabProps {
  studentContext: StudentContext;
}

export function SchedulePlannerTab({ studentContext }: SchedulePlannerTabProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">
              Schedule Planner
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Search sections and build your weekly schedule.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Spring 2026</span>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center p-8 text-center">
        <div className="max-w-md">
          <p className="text-sm font-medium text-gray-700">
            Coming next: weekly grid + live sections search.
          </p>
          <p className="mt-1 text-xs text-gray-400">
            Current major: {studentContext.major || "Not set"}
          </p>
        </div>
      </div>
    </div>
  );
}

