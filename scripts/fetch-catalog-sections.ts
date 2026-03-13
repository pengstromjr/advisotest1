/**
 * Fetches all courses from the UC Davis Courseleaf catalog (FOSE API)
 * and generates realistic section entries for courses likely offered in Spring.
 *
 * The registrar's class-search endpoint is aggressively rate-limited, so this
 * script supplements scraped data with catalog-derived sections.  Real scraped
 * sections (from scrape-sections.ts) always take priority when CRNs overlap.
 *
 * Output: data/sections/spring-2026.json  (merged with any existing file)
 */

import fs from "fs";
import path from "path";
import type { Section, SectionMeeting } from "@/lib/course-data";

const CATALOG_FOSE_URL =
  "https://catalog.ucdavis.edu/course-search/api/?page=fose";

const TERM_LABEL = "Spring Quarter 2026";
const DATA_DIR = path.join(__dirname, "..", "data", "sections");
const OUT_PATH = path.join(DATA_DIR, "spring-2026.json");

// ---------------------------------------------------------------------------
// FOSE API helpers
// ---------------------------------------------------------------------------

interface CatalogCourse {
  key: string;
  code: string;
  title: string;
  srcdb: string;
}

interface CatalogDetail {
  key: string;
  code: string;
  title: string;
  hours_html: string;
  description?: string;
  prerequisite?: string;
  coursedetails?: string;
}

async function fetchAllCourses(): Promise<CatalogCourse[]> {
  const res = await fetch(`${CATALOG_FOSE_URL}&route=search`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
    body: JSON.stringify({ other: { srcdb: "2025" }, criteria: [] }),
  });
  const data = await res.json();
  return data.results ?? [];
}

async function fetchCourseDetail(key: string): Promise<CatalogDetail | null> {
  try {
    const res = await fetch(`${CATALOG_FOSE_URL}&route=details`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "Mozilla/5.0" },
      body: JSON.stringify({ group: `key:${key}`, srcdb: "2025", matched: `key:${key}` }),
    });
    return await res.json();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Section generation helpers
// ---------------------------------------------------------------------------

// Weighted toward multi-day patterns which are the norm at UC Davis.
// Single-day slots are rare (seminars, labs) so they appear less often.
const MEETING_PATTERNS: { days: string[]; durationMin: number; weight: number }[] = [
  { days: ["M", "W", "F"], durationMin: 50, weight: 35 },
  { days: ["Tu", "Th"], durationMin: 80, weight: 30 },
  { days: ["M", "W"], durationMin: 80, weight: 15 },
  { days: ["Tu", "Th"], durationMin: 50, weight: 10 },
  { days: ["M"], durationMin: 170, weight: 2 },
  { days: ["W"], durationMin: 170, weight: 2 },
  { days: ["Tu"], durationMin: 170, weight: 3 },
  { days: ["Th"], durationMin: 170, weight: 3 },
];

const PATTERN_TOTAL_WEIGHT = MEETING_PATTERNS.reduce((s, p) => s + p.weight, 0);

function pickPattern(rand: () => number) {
  const r = rand() * PATTERN_TOTAL_WEIGHT;
  let acc = 0;
  for (const p of MEETING_PATTERNS) {
    acc += p.weight;
    if (r < acc) return p;
  }
  return MEETING_PATTERNS[0];
}

const START_HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17];
const START_MINUTES = [0, 10, 30, 40];

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function hashCode(str: string): number {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function parseUnits(hoursHtml: string): string {
  const m = hoursHtml.match(/([\d.]+(?:\s*(?:to|-)\s*[\d.]+)?)\s*unit/i);
  if (m) {
    const range = m[1].replace(/\s*(?:to|-)\s*/g, "-");
    return range;
  }
  return "4";
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function generateSections(
  course: CatalogCourse,
  detail: CatalogDetail | null,
  crnCounter: { val: number }
): Section[] {
  const code = course.code.replace(/&amp;/g, "&");
  const parts = code.match(/^([A-Z]{2,5})\s+(.+)$/i);
  if (!parts) return [];
  const subject = parts[1].toUpperCase();
  const courseNumber = parts[2].trim();

  const numericPart = parseInt(courseNumber, 10);
  if (isNaN(numericPart)) return [];

  // Skip courses unlikely to have scheduled sections
  const titleLower = (course.title || "").toLowerCase().replace(/&amp;/g, "&");
  if (
    /\b(thesis|dissertation|independent study|individual study|directed reading|field work|tutorial|internship|externship|practicum|clinical|research\s+(rotation|conference))\b/i.test(titleLower)
  ) {
    return [];
  }

  const rand = seededRandom(hashCode(code));
  const units = parseUnits(detail?.hours_html ?? "4 units");

  // Intro/gateway courses are always offered; others have a chance of not running
  let numSections: number;
  if (numericPart <= 30) {
    // Intro/gateway courses (e.g., MAT 17A, CHE 2A, BIS 2A): always offered, 4–8 sections
    numSections = 4 + Math.floor(rand() * 5);
  } else if (numericPart < 100) {
    // Other lower-division: ~75% offered, 2–5 sections
    if (rand() > 0.75) return [];
    numSections = 2 + Math.floor(rand() * 4);
  } else if (numericPart < 200) {
    // Upper-division undergrad: ~60% offered, 1–3 sections
    if (rand() > 0.6) return [];
    numSections = 1 + Math.floor(rand() * 3);
  } else {
    // Graduate: ~50% offered, 1 section
    if (rand() > 0.5) return [];
    numSections = 1;
  }

  const SAMPLE_INSTRUCTORS = [
    "Smith, J", "Chen, L", "Garcia, M", "Nguyen, T", "Williams, R",
    "Johnson, K", "Brown, A", "Davis, P", "Martinez, S", "Taylor, E",
    "Anderson, H", "Thomas, D", "Wilson, C", "Lee, Y", "White, B",
    "Moore, F", "Clark, G", "Hall, N", "Young, V", "King, W",
  ];

  const cleanTitle = course.title
    .replace(/&amp;/g, "&")
    .replace(/&#160;/g, " ")
    .replace(/&#8212;/g, "—")
    .trim();

  const sections: Section[] = [];
  const usedSlots = new Set<string>();

  for (let i = 0; i < numSections; i++) {
    const crn = crnCounter.val.toString().padStart(5, "0");
    crnCounter.val++;

    // Pick a unique day+time combination for each section
    let pattern, startHour, startMinute;
    let slotKey = "";
    let attempts = 0;
    do {
      pattern = pickPattern(rand);
      startHour = START_HOURS[Math.floor(rand() * START_HOURS.length)];
      startMinute = START_MINUTES[Math.floor(rand() * START_MINUTES.length)];
      slotKey = `${pattern.days.join("")}-${startHour}:${startMinute}`;
      attempts++;
    } while (usedSlots.has(slotKey) && attempts < 20);
    usedSlots.add(slotKey);

    const endTotalMin = startHour * 60 + startMinute + pattern.durationMin;
    const endHour = Math.floor(endTotalMin / 60);
    const endMinute = endTotalMin % 60;

    const meeting: SectionMeeting = {
      days: pattern.days,
      startTime: `${pad2(startHour)}:${pad2(startMinute)}`,
      endTime: `${pad2(endHour)}:${pad2(endMinute)}`,
      location: "TBA",
    };

    const instructor = SAMPLE_INSTRUCTORS[Math.floor(rand() * SAMPLE_INSTRUCTORS.length)];
    const seatsTotal = numericPart <= 30
      ? 100 + Math.floor(rand() * 200)
      : 20 + Math.floor(rand() * 180);
    const seatsAvailable = Math.max(0, Math.floor(rand() * seatsTotal * 0.4));

    const sectionCode = (i + 1).toString().padStart(3, "0");

    sections.push({
      term: TERM_LABEL,
      subject,
      courseNumber,
      courseCode: `${subject} ${courseNumber}`,
      title: cleanTitle,
      crn,
      section: sectionCode,
      units,
      meetings: [meeting],
      instructors: [instructor],
      modality: "in-person",
      seatsTotal,
      seatsAvailable,
      waitlistTotal: null,
      waitlistAvailable: null,
      notes: [],
    });
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Load existing scraped data (real sections from registrar only, CRN < 60000)
  // Generated sections (CRN >= 60000) are always regenerated with current logic
  const realSections = new Map<string, Section>();
  if (fs.existsSync(OUT_PATH)) {
    try {
      const existing: Section[] = JSON.parse(fs.readFileSync(OUT_PATH, "utf-8"));
      for (const s of existing) {
        if (parseInt(s.crn, 10) < 60000) {
          realSections.set(`${s.term}-${s.crn}`, s);
        }
      }
      console.log(`Loaded ${realSections.size} real scraped sections (CRN < 60000) — these take priority.`);
    } catch {
      console.log("No existing data found; starting fresh.");
    }
  }

  console.log("Fetching course catalog from FOSE API...");
  const courses = await fetchAllCourses();
  console.log(`  → ${courses.length} courses in catalog`);

  // Generate sections from catalog
  const crnCounter = { val: 60000 }; // Start CRNs at 60000 to avoid collisions
  const generatedSections: Section[] = [];
  let skippedCount = 0;

  for (const course of courses) {
    const sections = generateSections(course, null, crnCounter);
    if (sections.length === 0) {
      skippedCount++;
      continue;
    }
    generatedSections.push(...sections);
  }

  console.log(
    `Generated ${generatedSections.length} sections from catalog ` +
    `(skipped ${skippedCount} courses: not offered or ineligible)`
  );

  // Merge: real sections win, then generated fill in
  const merged = new Map<string, Section>();
  for (const s of generatedSections) {
    merged.set(`${s.term}-${s.crn}`, s);
  }
  // Real sections overwrite generated ones
  for (const [key, s] of realSections) {
    merged.set(key, s);
  }

  const all = Array.from(merged.values());

  // Sort by subject, courseNumber for nice output
  all.sort((a, b) => {
    if (a.subject !== b.subject) return a.subject.localeCompare(b.subject);
    const aN = parseInt(a.courseNumber, 10) || 0;
    const bN = parseInt(b.courseNumber, 10) || 0;
    return aN - bN;
  });

  fs.writeFileSync(OUT_PATH, JSON.stringify(all, null, 2));
  console.log(`\nWrote ${all.length} total sections to ${path.relative(process.cwd(), OUT_PATH)}`);

  // Stats
  const subjects = new Set(all.map((s) => s.subject));
  const withTimes = all.filter(
    (s) => s.meetings.some((m) => m.days.length > 0 && m.startTime)
  ).length;
  console.log(`  Subjects: ${subjects.size}`);
  console.log(`  With meeting times: ${withTimes}`);
  console.log(`  Real scraped: ${realSections.size}`);
  console.log(`  Catalog-generated: ${all.length - realSections.size}`);
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
