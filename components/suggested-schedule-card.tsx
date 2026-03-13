"use client";

import { useState, useEffect } from "react";
import { dispatchScheduleAdd } from "@/lib/schedule-store";
import type { Section } from "@/lib/course-data";

interface CatalogCourse {
  code: string;
  title: string;
  units: number | string;
  description: string;
  prerequisites: string | string[];
  ge_areas: string[];
}

interface SuggestedScheduleCardProps {
  courseCodes: string[];
}

export function SuggestedScheduleCard({ courseCodes }: SuggestedScheduleCardProps) {
  const [courses, setCourses] = useState<CatalogCourse[]>([]);
  const [sections, setSections] = useState<Record<string, Section | null>>({});
  const [loading, setLoading] = useState(true);
  const [added, setAdded] = useState(false);

  useEffect(() => {
    let active = true;

    async function fetchData() {
      try {
        setLoading(true);

        // Fetch course catalog data
        const codesParam = courseCodes.join(",");
        const catalogRes = await fetch(`/api/courses/lookup?codes=${encodeURIComponent(codesParam)}`);
        const catalogData = await catalogRes.json();
        if (active && catalogData.courses) {
          setCourses(catalogData.courses);
        }

        // Try to fetch section data (may not exist for all courses)
        const sectionMap: Record<string, Section | null> = {};
        for (const code of courseCodes) {
          try {
            const res = await fetch(`/api/sections?q=${encodeURIComponent(code.trim())}&limit=1`);
            const data = await res.json();
            sectionMap[code] = data.sections?.[0] || null;
          } catch {
            sectionMap[code] = null;
          }
        }
        if (active) setSections(sectionMap);
      } catch {
        // Even if fetching fails, don't crash
      } finally {
        if (active) setLoading(false);
      }
    }

    if (courseCodes.length > 0) {
      fetchData();
    } else {
      setLoading(false);
    }

    return () => { active = false; };
  }, [courseCodes]);

  const handleAddAll = () => {
    // Add any courses that have real section data to the planner
    const addable = Object.values(sections).filter((s): s is Section => s !== null);
    for (const section of addable) {
      dispatchScheduleAdd(section);
    }
    setAdded(true);
    setTimeout(() => setAdded(false), 2500);
  };

  if (loading) {
    return (
      <div className="my-2 rounded-xl border border-gray-200 bg-white p-4 shadow-sm animate-pulse">
        <div className="h-4 w-1/3 rounded bg-gray-200 mb-4" />
        <div className="space-y-3">
          <div className="h-12 rounded-lg bg-gray-100" />
          <div className="h-12 rounded-lg bg-gray-100" />
          <div className="h-12 rounded-lg bg-gray-100" />
        </div>
      </div>
    );
  }

  if (courses.length === 0) {
    return null;
  }

  const totalUnits = courses.reduce((sum, c) => {
    const val = typeof c.units === "string" ? parseFloat(c.units) : c.units;
    return sum + (val || 0);
  }, 0);

  const addableSections = Object.values(sections).filter((s): s is Section => s !== null);

  return (
    <div className="my-3 overflow-hidden rounded-xl border border-[#002855]/20 bg-white shadow-md ring-1 ring-[#002855]/5">
      {/* Header */}
      <div className="border-b border-gray-100 bg-gradient-to-r from-[#002855]/5 to-[#DAAA00]/5 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-[#002855]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <h4 className="text-sm font-bold text-gray-900">📅 Suggested Schedule</h4>
          </div>
          <span className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-[#002855] shadow-sm border border-[#002855]/10">
            {totalUnits} units
          </span>
        </div>
      </div>
      
      {/* Course list */}
      <div className="divide-y divide-gray-100 p-2">
        {courses.map((course) => {
          const section = sections[course.code];
          const meeting = section?.meetings?.[0];
          const days = meeting?.days?.join("") || null;
          const time = meeting?.startTime && meeting?.endTime
            ? `${meeting.startTime}–${meeting.endTime}`
            : null;

          return (
            <div key={course.code} className="flex flex-col gap-1 rounded-lg p-3 transition-colors hover:bg-gray-50">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-900 text-sm">
                  {course.code}
                </span>
                {days && time ? (
                  <span className="text-xs font-medium text-[#002855] bg-[#002855]/5 px-2 py-0.5 rounded-full shrink-0">
                    {days} {time}
                  </span>
                ) : (
                  <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                    Times TBA
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-600">{course.title}</span>
              <span className="text-xs text-gray-400">
                {typeof course.units === "number" ? course.units : parseFloat(String(course.units)) || "?"} units
                {course.ge_areas?.length > 0 && ` · GE: ${course.ge_areas.join(", ")}`}
              </span>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="border-t border-gray-100 bg-gray-50 p-3">
        {addableSections.length > 0 ? (
          <button
            onClick={handleAddAll}
            disabled={added}
            className={`flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all ${
              added
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-[#002855] text-white hover:bg-[#001a3a] shadow-sm"
            }`}
          >
            {added ? (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Added to Planner!
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                Add {addableSections.length} to Schedule Planner
              </>
            )}
          </button>
        ) : (
          <p className="text-center text-xs text-gray-400">
            Section times not available yet — search for these courses in the Schedule Planner to add them.
          </p>
        )}
      </div>
    </div>
  );
}
