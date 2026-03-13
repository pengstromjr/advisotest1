import type { Section } from "./course-data";
import type { TimeBlock } from "./time-blocks";

const SCHEDULE_STORAGE_KEY = "ucd-ai-schedule-spring-2026";
const BLOCKS_STORAGE_KEY = "ucd-ai-blocked-times-spring-2026";

export function getStoredPlannedSections(): Section[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SCHEDULE_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function getStoredBlockedTimes(): TimeBlock[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(BLOCKS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function parseTimeToMinutes(time: string): number {
  if (!time) return 0;
  const [h, m] = time.split(":").map((v) => parseInt(v, 10));
  return (h || 0) * 60 + (m || 0);
}

export function checkTimeConflict(section: Section, planned: Section[], blocked: TimeBlock[]) {
  for (const meeting of section.meetings) {
    if (!meeting.days || !meeting.startTime || !meeting.endTime) continue;
    
    const start = parseTimeToMinutes(meeting.startTime);
    const end = parseTimeToMinutes(meeting.endTime);

    // 1. Check against planned sections
    for (const ps of planned) {
      if (ps.crn === section.crn) continue;
      for (const pm of ps.meetings) {
        if (!pm.days || !pm.startTime || !pm.endTime) continue;
        const pStart = parseTimeToMinutes(pm.startTime);
        const pEnd = parseTimeToMinutes(pm.endTime);
        
        const sharedDays = meeting.days.filter(d => pm.days.includes(d));
        if (sharedDays.length > 0) {
          if (start < pEnd && end > pStart) return true;
        }
      }
    }

    // 2. Check against blocked times
    const DAY_MAP: Record<string, string> = { M: "Mon", T: "Tue", W: "Wed", R: "Thu", F: "Fri" };
    for (const b of blocked) {
      const bStart = parseTimeToMinutes(b.startTime);
      const bEnd = parseTimeToMinutes(b.endTime);
      
      const meetingDaysFull = meeting.days.map(d => DAY_MAP[d]);
      const sharedDays = b.days.filter(d => meetingDaysFull.includes(d));
      
      if (sharedDays.length > 0) {
        if (start < bEnd && end > bStart) return true;
      }
    }
  }
  return false;
}
