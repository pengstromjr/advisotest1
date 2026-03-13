import type { Section } from "./course-data";
import type { TimeBlock } from "./time-blocks";

interface TimeSlot {
  day: string;
  start: number; // minutes from midnight
  end: number;
}

const DAY_CODES: Record<string, string> = {
  M: "Mon",
  T: "Tue",
  W: "Wed",
  R: "Thu",
  F: "Fri",
};

function parseTime(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

function getSectionSlots(section: Section): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (const meeting of section.meetings) {
    if (!meeting.startTime || !meeting.endTime) continue;
    const start = parseTime(meeting.startTime);
    const end = parseTime(meeting.endTime);
    for (const dayCode of meeting.days) {
      const day = DAY_CODES[dayCode];
      if (day) slots.push({ day, start, end });
    }
  }
  return slots;
}

function slotsConflict(a: TimeSlot[], b: TimeSlot[]): boolean {
  for (const sa of a) {
    for (const sb of b) {
      if (sa.day === sb.day && sa.start < sb.end && sb.start < sa.end) {
        return true;
      }
    }
  }
  return false;
}

function scoreSection(section: Section): number {
  let score = 0;
  
  // Prefer sections with open seats
  if (section.seatsAvailable != null && section.seatsAvailable > 0) {
    score += 10;
  }

  // Factor in RMP Rating (if joined)
  if (section.rmp) {
    const instructorName = section.instructors[0];
    const rmpData = section.rmp[instructorName];
    if (rmpData) {
      // Scale rating (0-5) to points (0-15)
      score += rmpData.avgRating * 3;
      
      // Bonus for high "would take again"
      if (rmpData.wouldTakeAgainPercent > 80) score += 5;
      
      // Bonus for good GPA distributions
      if (rmpData.grades && rmpData.grades.avgGpa >= 3.3) {
        score += 5;
      }
    }
  }
  
  return score;
}

function findBestCombination(sectionsByGroup: Section[][], blockedTimes: TimeBlock[]): Section[] | null {
  let bestCombo: Section[] | null = null;
  let bestScore = -Infinity;

  // Convert blocked times into internal TimeSlot format
  const blockedSlots: TimeSlot[] = [];
  blockedTimes.forEach(b => {
    const start = parseTime(b.startTime);
    const end = parseTime(b.endTime);
    b.days.forEach(day => {
      blockedSlots.push({ day, start, end });
    });
  });

  function backtrack(idx: number, current: Section[], usedSlots: TimeSlot[], currentScore: number) {
    if (idx === sectionsByGroup.length) {
      if (currentScore > bestScore) {
        bestScore = currentScore;
        bestCombo = [...current];
      }
      return;
    }

    const group = sectionsByGroup[idx];
    for (const section of group) {
      const newSlots = getSectionSlots(section);
      
      // Check conflict with already used slots AND blocked slots
      if (!slotsConflict(usedSlots, newSlots) && !slotsConflict(blockedSlots, newSlots)) {
        const sectionScore = scoreSection(section);
        current.push(section);
        backtrack(idx + 1, current, [...usedSlots, ...newSlots], currentScore + sectionScore);
        current.pop();
      }
    }
  }

  // Sort each group by score (descending) to find good combos faster
  for (const group of sectionsByGroup) {
    group.sort((a, b) => scoreSection(b) - scoreSection(a));
  }

  backtrack(0, [], [], 0);
  return bestCombo;
}

// Fisher-Yates shuffle
function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export async function generateSchedule(pools: {
  major: string[];
  ge: string[];
  discovery: string[];
  blockedTimes?: TimeBlock[];
}): Promise<{ sections: Section[]; error?: string }> {
  const hasCourses = pools.major.length > 0 || pools.ge.length > 0 || pools.discovery.length > 0;
  if (!hasCourses) {
    return { sections: [], error: "No remaining courses to schedule." };
  }

  const maxAttempts = 10;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    // Determine composition: 2 major, 1 GE, 1 Discovery (if available)
    const targetMajor = Math.min(2, pools.major.length);
    const targetGe = Math.min(1, pools.ge.length);
    const targetDiscovery = Math.min(1, pools.discovery.length);

    const subset = [
      ...shuffle(pools.major).slice(0, targetMajor),
      ...shuffle(pools.ge).slice(0, targetGe),
      ...shuffle(pools.discovery).slice(0, targetDiscovery),
    ];

    if (subset.length === 0) continue;
    
    const sectionsByGroup: Section[][] = [];
    let fetchFailed = false;

    for (const code of subset) {
      try {
        const res = await fetch(`/api/sections?q=${encodeURIComponent(code.trim())}&limit=20`);
        if (!res.ok) {
          fetchFailed = true;
          break;
        }
        const data = await res.json();
        
        const withTimes = (data.sections || []).filter((s: Section) =>
          s.meetings?.some((m) => m.startTime && m.endTime && m.days?.length > 0)
        );
        
        if (withTimes.length === 0) {
          fetchFailed = true;
          break;
        }
        sectionsByGroup.push(withTimes);
      } catch {
        fetchFailed = true;
        break;
      }
    }

    if (fetchFailed || sectionsByGroup.length < subset.length) continue;

    const combo = findBestCombination(sectionsByGroup, pools.blockedTimes || []);
    if (combo) {
      return { sections: combo };
    }
  }

  return { 
    sections: [], 
    error: "Could not automatically find a conflict-free schedule mixing your priorities this term. Try selecting fewer categories or manually building your schedule." 
  };
}
