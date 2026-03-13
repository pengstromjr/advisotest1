export type Weekday = "Mon" | "Tue" | "Wed" | "Thu" | "Fri";

export const BLOCK_COLORS = [
  { bg: "#E0E7FF", border: "#6366F1", text: "#1E1B4B", label: "Indigo" },
  { bg: "#FEF3C7", border: "#F59E0B", text: "#451A03", label: "Amber" },
  { bg: "#D1FAE5", border: "#10B981", text: "#064E3B", label: "Emerald" },
  { bg: "#FFE4E6", border: "#FB7185", text: "#4C0519", label: "Rose" },
  { bg: "#E0F2FE", border: "#0EA5E9", text: "#082F49", label: "Sky" },
  { bg: "#F1F5F9", border: "#64748B", text: "#0F172A", label: "Slate" },
];

export interface TimeBlock {
  id: string;
  label?: string;
  color?: string;
  days: Weekday[];
  startTime: string; // "HH:MM"
  endTime: string; // "HH:MM"
}

export function snapTo15Minutes(minutes: number): number {
  return Math.round(minutes / 15) * 15;
}

export function loadTimeBlocks(storageKey: string): TimeBlock[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as TimeBlock[]) : [];
  } catch {
    return [];
  }
}

export function saveTimeBlocks(storageKey: string, blocks: TimeBlock[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(blocks));
  } catch {
    // ignore
  }
}

export function parseTimeToMinutes(time: string): number {
  const [h, m] = time.split(":").map((v) => parseInt(v, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

export function blocksToIntervalsByDay(blocks: TimeBlock[]) {
  const map: Record<Weekday, { start: number; end: number; id: string }[]> = {
    Mon: [],
    Tue: [],
    Wed: [],
    Thu: [],
    Fri: [],
  };

  for (const b of blocks) {
    const start = parseTimeToMinutes(b.startTime);
    const end = parseTimeToMinutes(b.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;
    for (const day of b.days) {
      map[day].push({ start, end, id: b.id });
    }
  }

  for (const day of Object.keys(map) as Weekday[]) {
    map[day].sort((a, b) => a.start - b.start);
  }

  return map;
}

export function intervalsOverlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

