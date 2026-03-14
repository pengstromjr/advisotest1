import type { Section } from "./course-data";
import type { TimeBlock } from "./time-blocks";
import { parseTimeToMinutes } from "./time-blocks";

export interface ScheduleHealth {
  conflicts: ScheduleConflict[];
  tips: string[];
  totalUnits: number;
}

export interface ScheduleConflict {
  type: "time" | "prerequisite" | "load";
  severity: "warning" | "error";
  message: string;
  courseCode?: string;
  relatedBlockId?: string;
}

export function checkScheduleHealth(
  sections: Section[],
  busyBlocks: TimeBlock[],
  completedCourses: string[]
): ScheduleHealth {
  const health: ScheduleHealth = {
    conflicts: [],
    tips: [],
    totalUnits: 0,
  };

  const uniqueCourses = new Set<string>();
  sections.forEach((s) => {
    if (!uniqueCourses.has(s.courseCode)) {
      const units =
        typeof s.units === "string" ? parseFloat(s.units) : s.units || 4;
      health.totalUnits += isNaN(units) ? 4 : units;
      uniqueCourses.add(s.courseCode);
    }
  });

  if (health.totalUnits > 17) {
    health.conflicts.push({
      type: "load",
      severity: "warning",
      message: `${health.totalUnits} units is a heavy load. Ensure you have enough study time!`,
    });
  }

  const addedCodes = Array.from(uniqueCourses);
  addedCodes.forEach((code) => {
    if (code === "ECS 150") {
      const hasPrereq =
        completedCourses.includes("ECS 036B") ||
        completedCourses.includes("ECS 036C") ||
        completedCourses.includes("ECS 034");
      if (!hasPrereq) {
        health.conflicts.push({
          type: "prerequisite",
          severity: "error",
          message: "ECS 150 requires ECS 36B/C or 34.",
          courseCode: code,
        });
      }
    }

    if (
      code === "ECS 122A" &&
      !completedCourses.includes("ECS 020") &&
      !completedCourses.includes("MAT 108")
    ) {
      health.conflicts.push({
        type: "prerequisite",
        severity: "error",
        message: "ECS 122A requires ECS 20 or MAT 108.",
        courseCode: code,
      });
    }

    const matCode = code.replace(/\s+/g, "");
    if (
      (matCode === "MAT021B" || matCode === "MAT21B") &&
      !completedCourses.includes("MAT 021A") &&
      !completedCourses.includes("MAT 21A")
    ) {
      health.conflicts.push({
        type: "prerequisite",
        severity: "error",
        message: `${code} requires MAT 21A.`,
        courseCode: code,
      });
    }
  });

  sections.forEach((section) => {
    if (!section.meetings) return;
    section.meetings.forEach((meeting) => {
      busyBlocks.forEach((block) => {
        const commonDays = meeting.days.filter((d) =>
          block.days.includes(d as never)
        );
        if (commonDays.length > 0) {
          const sStart = parseTimeToMinutes(meeting.startTime);
          const sEnd = parseTimeToMinutes(meeting.endTime);
          const bStart = parseTimeToMinutes(block.startTime);
          const bEnd = parseTimeToMinutes(block.endTime);

          if (sStart < bEnd && sEnd > bStart) {
            health.conflicts.push({
              type: "time",
              severity: "error",
              message: `${section.courseCode} overlaps with "${block.label || "Busy"}" on ${commonDays.join(", ")}.`,
              courseCode: section.courseCode,
              relatedBlockId: block.id,
            });
          }
        }
      });
    });
  });

  for (let i = 0; i < sections.length; i++) {
    for (let j = i + 1; j < sections.length; j++) {
      const sA = sections[i];
      const sB = sections[j];
      if (!sA.meetings || !sB.meetings) continue;

      for (const mA of sA.meetings) {
        for (const mB of sB.meetings) {
          const common = mA.days.filter((d) => mB.days.includes(d));
          if (common.length > 0) {
            const startA = parseTimeToMinutes(mA.startTime);
            const endA = parseTimeToMinutes(mA.endTime);
            const startB = parseTimeToMinutes(mB.startTime);
            const endB = parseTimeToMinutes(mB.endTime);

            if (startA < endB && endA > startB) {
              const alreadyFlagged = health.conflicts.some(
                (c) =>
                  c.type === "time" &&
                  c.courseCode === sA.courseCode &&
                  c.message.includes(sB.courseCode)
              );
              if (!alreadyFlagged) {
                health.conflicts.push({
                  type: "time",
                  severity: "error",
                  message: `${sA.courseCode} and ${sB.courseCode} have overlapping times on ${common.join(", ")}.`,
                  courseCode: sA.courseCode,
                });
              }
            }
          }
        }
      }
    }
  }

  return health;
}
