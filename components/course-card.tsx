"use client";

import { useEffect, useState, useCallback } from "react";
import type { Section } from "@/lib/course-data";
import {
  dispatchScheduleAdd,
  subscribeScheduleAdd,
  getPlannedCrns,
} from "@/lib/schedule-store";
import { PrerequisiteChain } from "@/components/prerequisite-chain";

interface CourseCardProps {
  courseCode: string;
  title: string;
  units: string;
  description?: string;
  geAreas?: string[];
  days?: string;
  time?: string;
  instructor?: string;
  crn?: string;
  seats?: string;
  completedCourses?: string[];
}

export function CourseCard({
  courseCode,
  title,
  units,
  description,
  geAreas,
  days,
  time,
  instructor,
  crn,
  seats,
  completedCourses,
}: CourseCardProps) {
  const [added, setAdded] = useState(false);
  const [addedAnim, setAddedAnim] = useState(false);

  const checkPlanned = useCallback(() => {
    if (!crn) return;
    const planned = getPlannedCrns();
    setAdded(planned.has(crn));
  }, [crn]);

  useEffect(() => {
    checkPlanned();
    const unsub = subscribeScheduleAdd(() => {
      setTimeout(checkPlanned, 100);
    });
    return unsub;
  }, [checkPlanned]);

  const handleAdd = async () => {
    if (added || !crn) return;

    try {
      const params = new URLSearchParams();
      params.set("crn", crn);
      params.set("term", "Spring Quarter 2026");
      const res = await fetch(`/api/sections?${params.toString()}`);
      const data = (await res.json()) as { sections?: Section[] };
      const section = data.sections?.[0];

      if (section) {
        dispatchScheduleAdd(section);
        setAdded(true);
        setAddedAnim(true);
        setTimeout(() => setAddedAnim(false), 600);
      } else {
        const parts = courseCode.match(/^([A-Z]{2,5})\s+(.+)$/i);
        const syntheticSection: Section = {
          term: "Spring Quarter 2026",
          subject: parts?.[1]?.toUpperCase() ?? courseCode.split(" ")[0] ?? "",
          courseNumber: parts?.[2] ?? "",
          courseCode,
          title,
          crn,
          section: "",
          units,
          meetings: days && time ? [{
            days: parseDayCodes(days),
            startTime: parseTimeRange(time)[0],
            endTime: parseTimeRange(time)[1],
            location: "TBA",
          }] : [{ days: [], startTime: "", endTime: "", location: "TBA" }],
          instructors: instructor ? [instructor] : ["Staff"],
          modality: "in-person",
          seatsTotal: null,
          seatsAvailable: null,
          waitlistTotal: null,
          waitlistAvailable: null,
          notes: [],
        };
        dispatchScheduleAdd(syntheticSection);
        setAdded(true);
        setAddedAnim(true);
        setTimeout(() => setAddedAnim(false), 600);
      }
    } catch {
      const parts = courseCode.match(/^([A-Z]{2,5})\s+(.+)$/i);
      const syntheticSection: Section = {
        term: "Spring Quarter 2026",
        subject: parts?.[1]?.toUpperCase() ?? "",
        courseNumber: parts?.[2] ?? "",
        courseCode,
        title,
        crn,
        section: "",
        units,
        meetings: [{ days: [], startTime: "", endTime: "", location: "TBA" }],
        instructors: instructor ? [instructor] : ["Staff"],
        modality: "in-person",
        seatsTotal: null,
        seatsAvailable: null,
        waitlistTotal: null,
        waitlistAvailable: null,
        notes: [],
      };
      dispatchScheduleAdd(syntheticSection);
      setAdded(true);
      setAddedAnim(true);
      setTimeout(() => setAddedAnim(false), 600);
    }
  };

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-gray-200 bg-gradient-to-b from-[#002855] to-[#001a3a] text-white shadow-lg">
      {/* Header */}
      <div className="px-4 pt-4 pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-bold leading-snug">{title}</h3>
            <p className="mt-0.5 text-sm text-blue-200">{courseCode}</p>
          </div>
          <span className="shrink-0 rounded-lg border border-white/20 bg-white/10 px-2.5 py-1 text-xs font-semibold">
            {units} units
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="bg-white px-4 py-3 text-gray-800">
        {description && (
          <p className="text-sm leading-relaxed text-gray-600">{description}</p>
        )}

        {/* Meeting info row */}
        {(days || time || instructor) && (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
            {days && (
              <span className="flex items-center gap-1">
                <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 0 1 2.25-2.25h13.5A2.25 2.25 0 0 1 21 7.5v11.25m-18 0A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75m-18 0v-7.5A2.25 2.25 0 0 1 5.25 9h13.5A2.25 2.25 0 0 1 21 11.25v7.5" />
                </svg>
                {days}
              </span>
            )}
            {time && (
              <span className="flex items-center gap-1">
                <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
                {time}
              </span>
            )}
            {instructor && (
              <span className="flex items-center gap-1">
                <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0ZM4.501 20.118a7.5 7.5 0 0 1 14.998 0A17.933 17.933 0 0 1 12 21.75c-2.676 0-5.216-.584-7.499-1.632Z" />
                </svg>
                {instructor}
              </span>
            )}
            {seats && (
              <span className="flex items-center gap-1">
                <svg className="h-3.5 w-3.5 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
                {seats}
              </span>
            )}
          </div>
        )}

        {/* GE tags */}
        {geAreas && geAreas.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {geAreas.map((ge) => (
              <span
                key={ge}
                className="rounded-md border border-gray-200 bg-gray-50 px-2 py-0.5 text-[11px] font-medium text-gray-600"
              >
                GE: {ge}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3">
          <PrerequisiteChain
            courseCode={courseCode}
            completedCourses={completedCourses}
            defaultExpanded={false}
          />
        </div>

        {/* Add to schedule button */}
        {crn && (
          <button
            type="button"
            onClick={handleAdd}
            disabled={added}
            className={`mt-3 flex w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-all ${
              added
                ? "bg-green-50 text-green-700 border border-green-200"
                : "bg-[#DAAA00] text-[#002855] hover:bg-[#c49900] active:scale-[0.98]"
            } ${addedAnim ? "scale-[1.02]" : ""}`}
          >
            {added ? (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                Added to Schedule
              </>
            ) : (
              <>
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add to Schedule
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

function parseDayCodes(days: string): string[] {
  const result: string[] = [];
  const d = days.replace(/,/g, "").trim();
  if (/Th/i.test(d)) result.push("Th");
  if (/Tu/i.test(d)) result.push("Tu");
  const stripped = d.replace(/Th/gi, "").replace(/Tu/gi, "");
  if (stripped.includes("M")) result.push("M");
  if (stripped.includes("T")) result.push("Tu");
  if (stripped.includes("W")) result.push("W");
  if (stripped.includes("R")) result.push("Th");
  if (stripped.includes("F")) result.push("F");
  return [...new Set(result)];
}

function parseTimeRange(time: string): [string, string] {
  const m = time.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
  if (m) return [m[1], m[2]];
  return ["", ""];
}
