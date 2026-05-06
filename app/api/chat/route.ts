import { openai } from "@ai-sdk/openai";
import {
  streamText,
  type UIMessage,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from "ai";
import { retrieve } from "@/lib/rag";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { extractCourseMentions } from "@/lib/course-lookup";
import type {
  StudentContext,
  Course,
  Section,
  RequirementSection,
} from "@/lib/course-data";
import {
  CURRENT_GRADES_FILE,
  CURRENT_SECTIONS_FILE,
  CURRENT_TERM_LABEL,
} from "@/lib/current-term";
import fs from "fs";
import path from "path";

function getLastUserText(messages: UIMessage[]): string {
  const lastUser = messages.filter((m) => m.role === "user").at(-1);
  if (!lastUser) return "";
  for (const part of lastUser.parts) {
    if (part.type === "text") return part.text;
  }
  return "";
}

import { z } from "zod";
import { tool } from "ai";

function formatCourseForPrompt(course: Course): string {
  const prereqs =
    typeof course.prerequisites === "string"
      ? course.prerequisites || "None"
      : course.prerequisites.length > 0
        ? course.prerequisites.join(", ")
        : "None";
  const ge = course.ge_areas.length > 0 ? course.ge_areas.join(", ") : "None";
  return `${course.code} — ${course.title} (${course.units} units). Prerequisites: ${prereqs}. GE: ${ge}. ${course.description}`;
}

// --- Cached data for chat route ---
interface RmpEntry {
  avgRating?: number;
  avgDifficulty?: number;
  wouldTakeAgainPercent?: number;
  numRatings?: number;
}

interface GradeProfessor {
  name?: string;
  totalGpa?: number;
  totalEnrolled?: number;
}

interface GradeEntry {
  overall_gpa?: number;
  overall_enrolled?: number;
  overall_grades?: Record<string, number>;
  professors?: GradeProfessor[];
}

let rmpCache: Record<string, RmpEntry> | null = null;
let gradesCache: Record<string, GradeEntry> | null = null;

function loadRmpData(): Record<string, RmpEntry> {
  if (rmpCache) return rmpCache;
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "data", "rmp.json"),
      "utf-8"
    );
    rmpCache = JSON.parse(raw);
  } catch {
    rmpCache = {};
  }
  return rmpCache!;
}

function loadGradesData(): Record<string, GradeEntry> {
  if (gradesCache) return gradesCache;
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "data", CURRENT_GRADES_FILE),
      "utf-8"
    );
    gradesCache = JSON.parse(raw);
  } catch {
    gradesCache = {};
  }
  return gradesCache!;
}

function formatSectionForPrompt(section: Section): string {
  const meetings =
    section.meetings.length > 0
      ? section.meetings
          .map((m) => {
            const days = m.days.join("");
            if (!days && !m.startTime && !m.endTime) return m.location;
            return `${days} ${m.startTime}-${m.endTime} at ${m.location}`;
          })
          .join("; ")
      : "TBA";
  const seats =
    section.seatsAvailable != null && section.seatsTotal != null
      ? `${section.seatsAvailable}/${section.seatsTotal} seats open`
      : "Seat availability not listed";
  const instructors =
    section.instructors.length > 0 ? section.instructors.join(", ") : "TBA";

  let base = `${section.courseCode} ${section.section || ""} — CRN ${section.crn} with ${instructors}. Meetings: ${meetings}. ${seats}.`;

  // Enrich with RMP data
  const rmp = loadRmpData();
  const primaryInst = section.instructors[0];
  if (primaryInst && rmp[primaryInst]) {
    const r = rmp[primaryInst];
    const parts: string[] = [];
    if (r.avgRating) parts.push(`Rating: ${r.avgRating}/5`);
    if (r.avgDifficulty) parts.push(`Difficulty: ${r.avgDifficulty}/5`);
    if (r.wouldTakeAgainPercent != null && r.wouldTakeAgainPercent >= 0)
      parts.push(`Would Take Again: ${r.wouldTakeAgainPercent}%`);
    if (r.numRatings) parts.push(`${r.numRatings} reviews`);
    if (parts.length > 0) base += ` RMP: ${parts.join(", ")}.`;
  }

  // Enrich with CattleLog grade data
  const grades = loadGradesData();
  const courseGrades = grades[section.courseCode];
  if (courseGrades && courseGrades.overall_gpa != null) {
    base += ` Avg GPA: ${courseGrades.overall_gpa} (${courseGrades.overall_enrolled} students).`;
    // Include professor-specific GPA if available
    if (primaryInst && courseGrades.professors) {
      const instParts = primaryInst.split(", ");
      const instLast = instParts[0]?.toLowerCase();
      const profMatch = courseGrades.professors.find((p) =>
        p.name?.toLowerCase().includes(instLast)
      );
      if (profMatch?.totalGpa != null) {
        base += ` This instructor's avg GPA: ${profMatch.totalGpa}.`;
      }
    }
  }

  return base;
}

function loadSectionsFile(): Section[] {
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "data", "sections", CURRENT_SECTIONS_FILE),
      "utf-8"
    );
    return JSON.parse(raw) as Section[];
  } catch {
    return [];
  }
}

let sectionCache: Section[] | null = null;
let allCoursesCache: Course[] | null = null;
const programRequirementsCache = new Map<string, RequirementSection[]>();

function loadCurrentSectionCodes(): Set<string> {
  if (!sectionCache) sectionCache = loadSectionsFile();
  return new Set(sectionCache.map((section) => section.courseCode));
}

async function loadAllCourses(): Promise<Course[]> {
  if (allCoursesCache) return allCoursesCache;
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "data", "courses.json"),
      "utf-8"
    );
    allCoursesCache = JSON.parse(raw) as Course[];
    try {
      const rawFull = fs.readFileSync(
        path.join(process.cwd(), "data", "courses-full.json"),
        "utf-8"
      );
      const full = JSON.parse(rawFull) as Course[];
      const merged = new Map<string, Course>();
      for (const c of allCoursesCache) merged.set(c.code, c);
      for (const c of full) merged.set(c.code, c);
      allCoursesCache = Array.from(merged.values());
    } catch {}
    const springOfferedCodes = loadCurrentSectionCodes();
    allCoursesCache = allCoursesCache.filter((course) =>
      springOfferedCodes.has(course.code)
    );
  } catch {
    allCoursesCache = [];
  }
  return allCoursesCache;
}

interface ScheduleRequestConstraints {
  isScheduleRequest: boolean;
  targetUnitsMin?: number;
  targetUnitsMax?: number;
  majorCourseCount?: number;
  majorCourseCountIsAdditional: boolean;
  needsUntaken: boolean;
  requiredCourseCodes: string[];
  forbiddenDays: string[];
  earliestStartMinutes?: number;
  latestEndMinutes?: number;
  blockedTimes: { day: string; start: number; end: number }[];
  preferredGeAreas: string[];
  requireOpenSeats: boolean;
  requiredModality?: Section["modality"];
}

interface ScheduleCandidate {
  code: string;
  title: string;
  units: number;
  kind: "major" | "elective";
  section?: Section;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  another: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
};

function parseNumberToken(value: string): number | undefined {
  const normalized = value.toLowerCase();
  if (NUMBER_WORDS[normalized] != null) return NUMBER_WORDS[normalized];
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseScheduleRequest(query: string): ScheduleRequestConstraints {
  const isScheduleRequest =
    /\b(?:build|make|create|generate)\b[\s\S]{0,80}\b(?:schedule|course\s+plan)\b/i.test(query) ||
    /\b(?:suggest|recommend)\s+(?:me\s+)?(?:a\s+)?(?:\d+\s*[- ]?\s*course\s+)?(?:schedule|course\s+plan)\b(?!\s+(?:blocks?|planner|constraints?))/i.test(query) ||
    /\bgive\s+me\b[\s\S]{0,80}\b(?:schedule|course\s+plan|\d{1,2}\s*(?:-|–|—|to)\s*\d{1,2}\s*units?)\b/i.test(query) ||
    /\b(?:schedule|course\s+plan)\b(?!\s+(?:blocks?|planner|constraints?))[\s\S]{0,80}\b(?:\d{1,2}\s*(?:-|–|—|to)\s*\d{1,2}\s*units?|major\s+(?:classes|courses)|courses|classes)\b/i.test(query) ||
    /\b\d{1,2}\s*(?:-|–|—|to)\s*\d{1,2}\s*units?\b[\s\S]*\b(?:courses|classes|crns?)\b/i.test(query);

  const constraints: ScheduleRequestConstraints = {
    isScheduleRequest,
    needsUntaken:
      /haven[’']?t\s+taken|have\s+not\s+taken|not\s+taken|untaken|remaining|still\s+need/i.test(
        query
      ),
    majorCourseCountIsAdditional: false,
    requiredCourseCodes: [],
    forbiddenDays: [],
    blockedTimes: [],
    preferredGeAreas: [],
    requireOpenSeats: false,
  };

  const rangeMatch = query.match(
    /\b(\d{1,2})\s*(?:-|–|—|to)\s*(\d{1,2})\s*units?\b/i
  );
  if (rangeMatch) {
    constraints.targetUnitsMin = Math.min(
      parseInt(rangeMatch[1], 10),
      parseInt(rangeMatch[2], 10)
    );
    constraints.targetUnitsMax = Math.max(
      parseInt(rangeMatch[1], 10),
      parseInt(rangeMatch[2], 10)
    );
  } else {
    const exactUnits = query.match(/\b(\d{1,2})\s*units?\b/i);
    if (exactUnits) {
      constraints.targetUnitsMin = parseInt(exactUnits[1], 10);
      constraints.targetUnitsMax = parseInt(exactUnits[1], 10);
    }
  }

  const majorMatch = query.match(
    /\b(\d+|one|another|two|three|four|five|six)\s+(?:[a-z-]+\s+){0,3}major\s+(?:classes|courses|class|course)\b/i
  );
  if (majorMatch) {
    constraints.majorCourseCount = parseNumberToken(majorMatch[1]);
    constraints.majorCourseCountIsAdditional =
      /\b(?:more|additional|another|other)\b/i.test(majorMatch[0]);
  }

  constraints.requiredCourseCodes = extractCourseCodeTokens(query);

  const lower = query.toLowerCase();
  const preferredGeAreas = new Set<string>();
  if (/\b(?:social\s+sciences?|ss)\b/.test(lower)) preferredGeAreas.add("SS");
  if (/\b(?:arts?\s*(?:&|and|\/)\s*humanities|arts?\s+humanities|ah)\b/.test(lower)) {
    preferredGeAreas.add("AH");
  }
  if (/\b(?:science\s*(?:&|and|\/)\s*engineering|se)\b/.test(lower)) {
    preferredGeAreas.add("SE");
  }
  constraints.preferredGeAreas = Array.from(preferredGeAreas);

  const dayToken =
    "(?:monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|mwf|tr|mw|wf|t\\/r)";
  const forbiddenDays = new Set<string>();
  const forbiddenDayRe = new RegExp(
    `\\b(?:no|without|skip)\\s+(?:(?:class(?:es)?|lectures?|meetings?|labs?|discussions?|sections?)\\s+)?(?:on\\s+)?(${dayToken}(?:\\s*(?:\\/|,|and|or)\\s*${dayToken})*)\\b`,
    "g"
  );
  let forbiddenDayMatch: RegExpExecArray | null;
  while ((forbiddenDayMatch = forbiddenDayRe.exec(lower)) !== null) {
    const suffix = lower.slice(forbiddenDayMatch.index + forbiddenDayMatch[0].length);
    if (/^\s*(?:from\s*)?(?:noon|midnight|\d{1,2})/.test(suffix)) continue;
    for (const day of parseDayText(forbiddenDayMatch[1])) {
      forbiddenDays.add(day);
    }
  }
  constraints.forbiddenDays = Array.from(forbiddenDays);

  const earliestMatch = lower.match(
    /\b(?:nothing|anything|no\s+(?:class(?:es)?|lectures?|meetings?|labs?|discussions?|sections?)|(?:class(?:es)?|lectures?|meetings?|labs?|discussions?|sections?))\s+(?:before|earlier\s+than)\s+(noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/
  );
  if (earliestMatch) {
    constraints.earliestStartMinutes = parseTimeTextToMinutes(earliestMatch[1]);
  }

  const afterMatch = lower.match(
    /\b(?:(?:class(?:es)?|lectures?|meetings?|labs?|discussions?|sections?)\s+(?:only\s+)?(?:after|at\s+or\s+after|starting\s+after|start\s+after)|(?:only\s+)?after)\s+(noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/
  );
  if (afterMatch) {
    constraints.earliestStartMinutes = parseTimeTextToMinutes(afterMatch[1]);
  }

  const latestMatch = lower.match(
    /\b(?:(?:nothing|anything|no\s+(?:class(?:es)?|lectures?|meetings?|labs?|discussions?|sections?)|(?:class(?:es)?|lectures?|meetings?|labs?|discussions?|sections?))\s+(?:after|later\s+than)|(?:done|end|ends|finish|out)\s+by)\s+(noon|midnight|\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/
  );
  if (latestMatch) {
    constraints.latestEndMinutes = parseTimeTextToMinutes(latestMatch[1]);
  }

  if (/\b(?:open seats?|seats?\s+open|available seats?|not waitlisted|no waitlist)\b/i.test(query)) {
    constraints.requireOpenSeats = true;
  }
  if (/\b(?:online|remote)\s+only\b/i.test(query)) {
    constraints.requiredModality = "online";
  } else if (/\b(?:in[-\s]?person)\s+only\b|\bnot\s+online\b/i.test(query)) {
    constraints.requiredModality = "in-person";
  }

  const dayRangeRe = new RegExp(
    `\\b(${dayToken}(?:\\s*(?:\\/|,|and|or)\\s*${dayToken})*)\\s*(?:from\\s*)?(noon|midnight|\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)\\s*(?:-|–|—|to)\\s*(noon|midnight|\\d{1,2}(?::\\d{2})?\\s*(?:am|pm)?)`,
    "gi"
  );
  let blockedMatch: RegExpExecArray | null;
  while ((blockedMatch = dayRangeRe.exec(query)) !== null) {
    const days = parseDayText(blockedMatch[1]);
    if (days.length === 0) continue;
    const endMeridiem = blockedMatch[3].match(/\b(am|pm)\b/i)?.[1];
    const start = parseTimeTextToMinutes(blockedMatch[2], endMeridiem);
    const end = parseTimeTextToMinutes(blockedMatch[3]);
    if (start == null || end == null || end <= start) continue;
    for (const day of days) {
      constraints.blockedTimes.push({ day, start, end });
    }
  }

  return constraints;
}

function extractCourseCodeTokens(text: string): string[] {
  const codes = new Set<string>();
  const ignoredSubjects = new Set(["AND", "OR", "THE", "WITH", "FROM"]);
  const courseRe = /\b([A-Z]{2,5})\s*(\d{1,3}[A-Z]?)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = courseRe.exec(text)) !== null) {
    if (ignoredSubjects.has(match[1].toUpperCase())) continue;
    const prefix = text.slice(Math.max(0, match.index - 40), match.index).toLowerCase();
    if (/\b(?:not|without|except|haven[’']?t\s+taken|have\s+not\s+taken|never\s+took|but\s+not)\s*$/.test(prefix)) {
      continue;
    }
    codes.add(normalizeCourseCode(`${match[1]} ${match[2]}`));
  }
  return Array.from(codes);
}

function parseTimeTextToMinutes(
  value: string,
  fallbackMeridiem?: string
): number | undefined {
  const normalized = value.trim().toLowerCase();
  if (normalized === "noon") return 12 * 60;
  if (normalized === "midnight") return 0;
  const match = normalized.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/);
  if (!match) return undefined;
  return parseClockTimeToMinutes(match[1], match[2], match[3] || fallbackMeridiem);
}

function parseClockTimeToMinutes(
  hourText: string,
  minuteText?: string,
  meridiem?: string
): number | undefined {
  let hour = parseInt(hourText, 10);
  const minute = minuteText ? parseInt(minuteText, 10) : 0;
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return undefined;
  const marker = meridiem?.toLowerCase();
  if (marker === "pm" && hour < 12) hour += 12;
  if (marker === "am" && hour === 12) hour = 0;
  if (!marker && hour >= 1 && hour <= 7) hour += 12;
  return hour * 60 + minute;
}

function parseDayText(text: string): string[] {
  const lower = text.toLowerCase();
  const days = new Set<string>();
  if (/\bmwf\b/.test(lower)) {
    days.add("M");
    days.add("W");
    days.add("F");
  }
  if (/\b(?:tr|t\/r)\b/.test(lower)) {
    days.add("T");
    days.add("R");
  }
  if (/\bmw\b/.test(lower)) {
    days.add("M");
    days.add("W");
  }
  if (/\bwf\b/.test(lower)) {
    days.add("W");
    days.add("F");
  }
  if (/\b(?:monday|mon)\b/.test(lower)) days.add("M");
  if (/\b(?:tuesday|tue)\b/.test(lower)) days.add("T");
  if (/\b(?:wednesday|wed)\b/.test(lower)) days.add("W");
  if (/\b(?:thursday|thu)\b/.test(lower)) days.add("R");
  if (/\b(?:friday|fri)\b/.test(lower)) days.add("F");
  return Array.from(days);
}

function normalizeCourseCode(code: string): string {
  const normalized = code.toUpperCase().replace(/\s+/g, " ").trim();
  return normalized.replace(
    /^([A-Z]{2,5})\s+(\d{1,2})([A-Z]?)$/,
    (_, subject: string, number: string, suffix: string) =>
      `${subject} ${number.padStart(3, "0")}${suffix || ""}`
  );
}

function parseUnits(units: number | string | undefined): number {
  if (typeof units === "number") return Number.isFinite(units) ? units : 0;
  const parsed = parseFloat(String(units ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function courseNumber(code: string): number {
  const match = code.match(/\b(\d{1,3})/);
  return match ? parseInt(match[1], 10) : 999;
}

function courseHasNoPrereqs(course: Course): boolean {
  const prereqs = Array.isArray(course.prerequisites)
    ? course.prerequisites.join(" ")
    : String(course.prerequisites || "");
  return prereqs.trim().length === 0;
}

function coursePrereqsLikelySatisfied(
  course: Course,
  completed: Set<string>
): boolean {
  const prereqs = Array.isArray(course.prerequisites)
    ? course.prerequisites.join("; ")
    : String(course.prerequisites || "");
  if (!prereqs.trim()) return true;

  const groups = prereqs
    .split(/;|\.\s+|\)\s*,?\s*\(/)
    .map((group) =>
      extractRequirementCodes(group, { stripParentheticals: false })
    )
    .filter((codes) => codes.length > 0);

  if (groups.length === 0) return true;
  return groups.every((codes) => codes.some((code) => completed.has(code)));
}

function extractRequirementCodes(
  value: string,
  options: { stripParentheticals?: boolean } = {}
): string[] {
  const stripParentheticals = options.stripParentheticals ?? true;
  const text = (stripParentheticals ? value.replace(/\(.+?\)/g, "") : value)
    .replace(/^or\s+/i, "")
    .toUpperCase()
    .trim();
  const fallbackNumber = text.match(/\b(\d{1,3}[A-Z]?)\b/)?.[1];
  const codes = new Set<string>();

  for (const part of text.split("/")) {
    const match = part.match(/\b([A-Z]{2,5})\s*(\d{1,3}[A-Z]?)\b/);
    if (match) {
      codes.add(`${match[1]} ${match[2]}`);
      continue;
    }
    const subjectOnly = part.match(/\b([A-Z]{2,5})\b/);
    if (subjectOnly && fallbackNumber) {
      codes.add(`${subjectOnly[1]} ${fallbackNumber}`);
    }
  }

  const directRe = /\b([A-Z]{2,5})\s*(\d{1,3}[A-Z]?)\b/g;
  let direct: RegExpExecArray | null;
  while ((direct = directRe.exec(text)) !== null) {
    codes.add(`${direct[1]} ${direct[2]}`);
  }

  return Array.from(codes).map(normalizeCourseCode);
}

function loadProgramRequirements(programName: string): RequirementSection[] {
  const cached = programRequirementsCache.get(programName);
  if (cached) return cached;

  const majorsDir = path.join(process.cwd(), "data", "majors");
  let requirements: RequirementSection[] = [];
  try {
    const files = fs.readdirSync(majorsDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      const raw = fs.readFileSync(path.join(majorsDir, file), "utf-8");
      const data = JSON.parse(raw) as { name?: string; requirements?: RequirementSection[] };
      if (data.name === programName) {
        requirements = data.requirements || [];
        break;
      }
    }
  } catch {
    requirements = [];
  }

  programRequirementsCache.set(programName, requirements);
  return requirements;
}

function formatProgramRequirementsForPrompt(
  programName: string,
  completed: Set<string> = new Set()
): string | null {
  const requirements = loadProgramRequirements(programName);
  if (requirements.length === 0) return null;

  const lines = [`Exact degree requirements for ${programName}:`];
  for (const requirement of requirements.slice(0, 24)) {
    const parts = [`- ${requirement.heading}`];
    if (requirement.group) parts.push(`[${requirement.group}]`);
    if (requirement.units) parts.push(`(${requirement.units} units)`);
    if (requirement.notes?.length) {
      parts.push(`Notes: ${requirement.notes.join(" ")}`);
    }
    if (requirement.courses?.length) {
      parts.push(`Courses: ${requirement.courses.join(", ")}`);
    }
    lines.push(parts.join(" "));
  }
  if (completed.size > 0) {
    const progressLines = requirements
      .map((requirement) => formatRequirementProgress(requirement, completed))
      .filter((line): line is string => Boolean(line));
    if (progressLines.length > 0) {
      lines.push("Completed-course comparison from the current student profile:");
      lines.push(...progressLines.slice(0, 18));
    }
  }
  lines.push(
    "When checking remaining requirements or eligibility, compare the completed courses against every listed required course and every choose-one alternative. Do not mark a prerequisite as satisfied unless every required prerequisite group has a completed course."
  );
  return lines.join("\n");
}

function formatRequirementProgress(
  requirement: RequirementSection,
  completed: Set<string>
): string | null {
  if (!requirement.courses?.length) return null;
  const groups = groupRequirementCourses(requirement.courses);
  if (groups.length === 0) return null;

  const notes = requirement.notes?.join(" ") || "";
  const isChoiceRequirement = /\bchoose\s+(?:one|two|three|four|\d+)/i.test(notes);
  const label = requirement.group
    ? `${requirement.heading} [${requirement.group}]`
    : requirement.heading;

  if (isChoiceRequirement) {
    const completedGroups = groups.filter((group) =>
      group.some((code) => completed.has(code))
    );
    if (completedGroups.length > 0) {
      return `- ${label}: completed option(s): ${completedGroups
        .map((group) => group.join(" or "))
        .join("; ")}.`;
    }
    return `- ${label}: still need an option from ${groups
      .map((group) => group.join(" or "))
      .join("; ")}.`;
  }

  const missingGroups = groups.filter(
    (group) => !group.some((code) => completed.has(code))
  );
  if (missingGroups.length === 0) {
    return `- ${label}: all listed requirement groups appear completed.`;
  }
  return `- ${label}: still missing ${missingGroups
    .map((group) => group.join(" or "))
    .join("; ")}.`;
}

function groupRequirementCourses(courses: string[]): string[][] {
  const groups: string[][] = [];
  let current: string[] = [];

  for (const rawCourse of courses) {
    const codes = extractRequirementCodes(rawCourse);
    if (codes.length === 0) continue;
    if (/^\s*or\b/i.test(rawCourse) && current.length > 0) {
      current.push(...codes);
      continue;
    }
    if (current.length > 0) groups.push(Array.from(new Set(current)));
    current = [...codes];
  }

  if (current.length > 0) groups.push(Array.from(new Set(current)));
  return groups;
}

function shouldIncludeProgramRequirementContext(query: string): boolean {
  return /major|minor|degree|requirement|prep|preparation|eligible|eligibility|prereq|prerequisite|can\s+i\s+take|switch|change|transfer|graduate|graduation|remaining/i.test(
    query
  );
}

function getSlots(section: Section): { day: string; start: number; end: number }[] {
  const slots: { day: string; start: number; end: number }[] = [];
  for (const meeting of section.meetings || []) {
    if (!meeting.startTime || !meeting.endTime) continue;
    const [startHour, startMin] = meeting.startTime.split(":").map(Number);
    const [endHour, endMin] = meeting.endTime.split(":").map(Number);
    if (!Number.isFinite(startHour) || !Number.isFinite(endHour)) continue;
    const start = (startHour || 0) * 60 + (startMin || 0);
    const end = (endHour || 0) * 60 + (endMin || 0);
    for (const day of meeting.days || []) slots.push({ day, start, end });
  }
  return slots;
}

function timeBlockToSlots(
  block: NonNullable<StudentContext["blockedTimes"]>[number]
): { day: string; start: number; end: number }[] {
  const dayMap: Record<string, string> = {
    Mon: "M",
    Tue: "T",
    Wed: "W",
    Thu: "R",
    Fri: "F",
  };
  const start = parseStoredTimeToMinutes(block.startTime);
  const end = parseStoredTimeToMinutes(block.endTime);
  if (start == null || end == null || end <= start) return [];
  return (block.days || [])
    .map((day) => dayMap[day])
    .filter((day): day is string => Boolean(day))
    .map((day) => ({ day, start, end }));
}

function parseStoredTimeToMinutes(value: string): number | undefined {
  const [hourText, minuteText] = String(value || "").split(":");
  const hour = parseInt(hourText, 10);
  const minute = parseInt(minuteText, 10);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return undefined;
  return hour * 60 + minute;
}

function pushUniqueSlots(
  target: { day: string; start: number; end: number }[],
  slots: { day: string; start: number; end: number }[]
) {
  for (const slot of slots) {
    if (
      target.some(
        (existing) =>
          existing.day === slot.day &&
          existing.start === slot.start &&
          existing.end === slot.end
      )
    ) {
      continue;
    }
    target.push(slot);
  }
}

function mergeStudentScheduleStateIntoConstraints(
  constraints: ScheduleRequestConstraints,
  studentContext: StudentContext | null
) {
  for (const block of studentContext?.blockedTimes || []) {
    pushUniqueSlots(constraints.blockedTimes, timeBlockToSlots(block));
  }
  for (const section of studentContext?.plannedSections || []) {
    pushUniqueSlots(constraints.blockedTimes, getSlots(section));
  }
}

function formatStudentTimeBlocksForPrompt(
  blocks: StudentContext["blockedTimes"]
): string[] {
  return (blocks || [])
    .map((block) => {
      const slots = timeBlockToSlots(block);
      if (slots.length === 0) return "";
      const days = formatDayList(slots.map((slot) => slot.day));
      const label = block.label ? `${block.label}: ` : "";
      return `${label}${days} ${minutesToDisplay(slots[0].start)}-${minutesToDisplay(slots[0].end)}`;
    })
    .filter(Boolean);
}

function formatPlannedSectionsForPrompt(
  sections: StudentContext["plannedSections"]
): string[] {
  return (sections || []).map(
    (section) =>
      `${normalizeCourseCode(section.courseCode)} — ${section.title}; ${formatSelectedSection(section)}`
  );
}

function hasUsableMeeting(section: Section): boolean {
  return getSlots(section).length > 0;
}

function slotsConflict(
  a: { day: string; start: number; end: number }[],
  b: { day: string; start: number; end: number }[]
): boolean {
  return a.some((left) =>
    b.some(
      (right) =>
        left.day === right.day && left.start < right.end && right.start < left.end
    )
  );
}

function sectionSatisfiesScheduleConstraints(
  section: Section,
  constraints?: ScheduleRequestConstraints
): boolean {
  if (!constraints) return true;
  const slots = getSlots(section);
  if (
    constraints.forbiddenDays.length > 0 &&
    slots.some((slot) => constraints.forbiddenDays.includes(slot.day))
  ) {
    return false;
  }
  if (
    constraints.earliestStartMinutes != null &&
    slots.some((slot) => slot.start < constraints.earliestStartMinutes!)
  ) {
    return false;
  }
  if (
    constraints.latestEndMinutes != null &&
    slots.some((slot) => slot.end > constraints.latestEndMinutes!)
  ) {
    return false;
  }
  if (
    constraints.blockedTimes.length > 0 &&
    slotsConflict(slots, constraints.blockedTimes)
  ) {
    return false;
  }
  if (
    constraints.requireOpenSeats &&
    (section.seatsAvailable == null || section.seatsAvailable <= 0)
  ) {
    return false;
  }
  if (
    constraints.requiredModality &&
    section.modality !== constraints.requiredModality
  ) {
    return false;
  }
  return true;
}

function candidateSectionsForCode(
  code: string,
  constraints?: ScheduleRequestConstraints
): Section[] {
  if (!sectionCache) sectionCache = loadSectionsFile();
  const normalizedCode = normalizeCourseCode(code);
  return sectionCache
    .filter((section) => normalizeCourseCode(section.courseCode) === normalizedCode)
    .filter(hasUsableMeeting)
    .filter((section) => sectionSatisfiesScheduleConstraints(section, constraints))
    .sort((a, b) => {
      const openA = a.seatsAvailable == null ? 1 : a.seatsAvailable > 0 ? 2 : 0;
      const openB = b.seatsAvailable == null ? 1 : b.seatsAvailable > 0 ? 2 : 0;
      if (openB !== openA) return openB - openA;
      return (b.seatsAvailable || 0) - (a.seatsAvailable || 0);
    })
    .slice(0, 8);
}

function chooseSections(
  codes: string[],
  constraints?: ScheduleRequestConstraints
): Section[] | null {
  const groups = codes.map((code) => candidateSectionsForCode(code, constraints));
  if (groups.some((group) => group.length === 0)) return null;

  let result: Section[] | null = null;
  function backtrack(index: number, chosen: Section[], usedSlots: ReturnType<typeof getSlots>) {
    if (result) return;
    if (index === groups.length) {
      result = [...chosen];
      return;
    }
    for (const section of groups[index]) {
      const nextSlots = getSlots(section);
      if (slotsConflict(usedSlots, nextSlots)) continue;
      chosen.push(section);
      backtrack(index + 1, chosen, [...usedSlots, ...nextSlots]);
      chosen.pop();
    }
  }

  backtrack(0, [], [...(constraints?.blockedTimes || [])]);
  return result;
}

function formatSelectedSection(section: Section): string {
  const meetings =
    section.meetings
      ?.map((meeting) => {
        const days = meeting.days?.join("") || "";
        if (!days || !meeting.startTime || !meeting.endTime) return "";
        return `${days} ${meeting.startTime}-${meeting.endTime}`;
      })
      .filter(Boolean)
      .join("; ") || "TBA";
  const instructor = section.instructors?.length
    ? section.instructors.join(", ")
    : "TBA";
  return `CRN ${section.crn}, ${meetings}, ${instructor}`;
}

function formatScheduleBlockEntry(course: ScheduleCandidate): string {
  return course.section?.crn ? `${course.code}:${course.section.crn}` : course.code;
}

function minutesToDisplay(minutes: number): string {
  const hour24 = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const marker = hour24 >= 12 ? "pm" : "am";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")}${marker}`;
}

function formatDayList(days: string[]): string {
  const names: Record<string, string> = {
    M: "Monday",
    T: "Tuesday",
    W: "Wednesday",
    R: "Thursday",
    F: "Friday",
  };
  return days.map((day) => names[day] || day).join(", ");
}

function findCoursePlan(
  majorCandidates: Course[],
  electiveCandidates: Course[],
  majorCount: number,
  minUnits: number,
  maxUnits: number,
  constraints: ScheduleRequestConstraints,
  requiredMajorCourses: Course[] = [],
  requiredElectiveCourses: Course[] = []
): ScheduleCandidate[] | null {
  const requiredCodes = new Set(
    [...requiredMajorCourses, ...requiredElectiveCourses].map((course) =>
      normalizeCourseCode(course.code)
    )
  );
  const remainingMajorCount = majorCount - requiredMajorCourses.length;
  if (remainingMajorCount < 0) return null;

  const selectedMajorCourses =
    remainingMajorCount > 0
      ? majorCandidates
          .filter((course) => !requiredCodes.has(normalizeCourseCode(course.code)))
          .slice(0, 28)
      : [];
  const selectedElectives = electiveCandidates
    .filter((course) => !requiredCodes.has(normalizeCourseCode(course.code)))
    .slice(0, 90);

  const majorCombos: Course[][] = [];
  function chooseMajors(start: number, current: Course[]) {
    if (majorCombos.length >= 80) return;
    if (current.length === remainingMajorCount) {
      majorCombos.push([...current]);
      return;
    }
    for (let i = start; i < selectedMajorCourses.length; i++) {
      current.push(selectedMajorCourses[i]);
      chooseMajors(i + 1, current);
      current.pop();
    }
  }

  if (remainingMajorCount > 0) chooseMajors(0, []);
  else majorCombos.push([]);

  for (const majorCombo of majorCombos) {
    const majorCourses = [...requiredMajorCourses, ...majorCombo];
    const baseCourses = [...majorCourses, ...requiredElectiveCourses];
    const baseUnits = baseCourses.reduce(
      (sum, course) => sum + parseUnits(course.units),
      0
    );
    const baseCodes = new Set(
      baseCourses.map((course) => normalizeCourseCode(course.code))
    );

    function fillElectives(
      start: number,
      current: Course[],
      currentUnits: number
    ): ScheduleCandidate[] | null {
      if (currentUnits >= minUnits && currentUnits <= maxUnits) {
        const candidates: ScheduleCandidate[] = [
          ...majorCourses.map((course) => ({
            code: normalizeCourseCode(course.code),
            title: course.title,
            units: parseUnits(course.units),
            kind: "major" as const,
          })),
          ...requiredElectiveCourses.map((course) => ({
            code: normalizeCourseCode(course.code),
            title: course.title,
            units: parseUnits(course.units),
            kind: "elective" as const,
          })),
          ...current.map((course) => ({
            code: normalizeCourseCode(course.code),
            title: course.title,
            units: parseUnits(course.units),
            kind: "elective" as const,
          })),
        ];
        const sections = chooseSections(
          candidates.map((candidate) => candidate.code),
          constraints
        );
        if (!sections) return null;
        return candidates.map((candidate, index) => ({
          ...candidate,
          section: sections[index],
        }));
      }
      if (currentUnits > maxUnits || current.length >= 4) return null;

      for (let i = start; i < selectedElectives.length; i++) {
        const elective = selectedElectives[i];
        const code = normalizeCourseCode(elective.code);
        if (baseCodes.has(code) || current.some((course) => normalizeCourseCode(course.code) === code)) {
          continue;
        }
        const units = parseUnits(elective.units);
        if (units <= 0) continue;
        const found = fillElectives(i + 1, [...current, elective], currentUnits + units);
        if (found) return found;
      }
      return null;
    }

    const found = fillElectives(0, [], baseUnits);
    if (found) return found;
  }

  return null;
}

async function buildScheduleGuidance(
  query: string,
  studentContext: StudentContext | null
): Promise<string | null> {
  const constraints = parseScheduleRequest(query);
  if (!constraints.isScheduleRequest) return null;
  mergeStudentScheduleStateIntoConstraints(constraints, studentContext);
  const studentBlockedTimeLines = formatStudentTimeBlocksForPrompt(
    studentContext?.blockedTimes
  );
  const plannedSectionLines = formatPlannedSectionsForPrompt(
    studentContext?.plannedSections
  );

  if (!sectionCache) sectionCache = loadSectionsFile();
  const allCourses = await loadAllCourses();
  const offeredCodes = loadCurrentSectionCodes();
  const completed = new Set(
    (studentContext?.completedCourses || []).map(normalizeCourseCode)
  );
  const courseByCode = new Map(
    allCourses.map((course) => [normalizeCourseCode(course.code), course])
  );

  const targetMin = constraints.targetUnitsMin ?? 12;
  const targetMax = constraints.targetUnitsMax ?? 17;
  const programName = studentContext?.targetMajor || studentContext?.major || "";

  const majorCodeSet = new Set<string>();
  const majorRequirementCodes: string[] = [];
  if (programName) {
    for (const requirement of loadProgramRequirements(programName)) {
      for (const rawCourse of requirement.courses || []) {
        for (const code of extractRequirementCodes(rawCourse)) {
          if (majorCodeSet.has(code)) continue;
          majorCodeSet.add(code);
          majorRequirementCodes.push(code);
        }
      }
    }
  }

  const knownSubjects = new Set(
    Array.from(offeredCodes).map((code) => normalizeCourseCode(code).split(" ")[0])
  );
  const rawRequiredCourseCodes = Array.from(
    new Set(
      constraints.requiredCourseCodes
        .map(normalizeCourseCode)
        .filter((code) => knownSubjects.has(code.split(" ")[0]))
        .filter((code) => !completed.has(code))
    )
  );
  const requiredCourseBlockers: string[] = [];
  const requiredCourses: Course[] = [];
  for (const code of rawRequiredCourseCodes) {
    const course = courseByCode.get(code);
    if (!course) {
      requiredCourseBlockers.push(`${code}: not found in the current catalog data.`);
      continue;
    }
    if (!offeredCodes.has(code)) {
      requiredCourseBlockers.push(`${code}: not found in ${CURRENT_TERM_LABEL} section data.`);
      continue;
    }
    if (!coursePrereqsLikelySatisfied(course, completed)) {
      const prereqs =
        typeof course.prerequisites === "string"
          ? course.prerequisites
          : course.prerequisites.join("; ");
      requiredCourseBlockers.push(
        `${code}: prerequisites do not appear satisfied from completed courses (${prereqs || "no prerequisite text available"}).`
      );
      continue;
    }
    if (candidateSectionsForCode(code, constraints).length === 0) {
      requiredCourseBlockers.push(
        `${code}: no section fits the requested day/time constraints.`
      );
      continue;
    }
    requiredCourses.push(course);
  }

  const requiredMajorCourses = requiredCourses.filter((course) =>
    majorCodeSet.has(normalizeCourseCode(course.code))
  );
  const requiredElectiveCourses = requiredCourses.filter(
    (course) => !majorCodeSet.has(normalizeCourseCode(course.code))
  );
  const parsedMajorCount = constraints.majorCourseCount ?? 0;
  const requestedMajorCount =
    constraints.majorCourseCount == null
      ? requiredMajorCourses.length
      : constraints.majorCourseCountIsAdditional
        ? parsedMajorCount + requiredMajorCourses.length
        : Math.max(parsedMajorCount, requiredMajorCourses.length);

  const majorCandidates = majorRequirementCodes
    .filter((code) => !completed.has(code))
    .filter((code) => offeredCodes.has(code))
    .map((code) => courseByCode.get(code))
    .filter((course): course is Course => Boolean(course))
    .filter((course) => coursePrereqsLikelySatisfied(course, completed))
    .filter(
      (course) =>
        candidateSectionsForCode(normalizeCourseCode(course.code), constraints).length > 0
    )
    .sort((a, b) => {
      const aNum = courseNumber(a.code);
      const bNum = courseNumber(b.code);
      const aUpper = aNum >= 100 && aNum < 200 ? 0 : 1;
      const bUpper = bNum >= 100 && bNum < 200 ? 0 : 1;
      if (aUpper !== bUpper) return aUpper - bUpper;
      return majorRequirementCodes.indexOf(normalizeCourseCode(a.code)) -
        majorRequirementCodes.indexOf(normalizeCourseCode(b.code));
    });

  const electiveCandidates = allCourses
    .filter((course) => {
      const code = normalizeCourseCode(course.code);
      const units = parseUnits(course.units);
      return (
        !completed.has(code) &&
        !majorCodeSet.has(code) &&
        offeredCodes.has(code) &&
        units >= 3 &&
        units <= 5 &&
        courseNumber(code) < 200 &&
        course.ge_areas?.length > 0 &&
        (constraints.preferredGeAreas.length === 0 ||
          course.ge_areas.some((area) =>
            constraints.preferredGeAreas.includes(area.toUpperCase())
          )) &&
        courseHasNoPrereqs(course) &&
        candidateSectionsForCode(code, constraints).length > 0
      );
    })
    .sort((a, b) => {
      const aUnits = parseUnits(a.units);
      const bUnits = parseUnits(b.units);
      if (bUnits !== aUnits) return bUnits - aUnits;
      return a.code.localeCompare(b.code);
    });

  const plan =
    (requestedMajorCount > 0 ||
      requiredCourses.length > 0 ||
      constraints.targetUnitsMin != null) &&
    requiredCourseBlockers.length === 0
      ? findCoursePlan(
          majorCandidates,
          electiveCandidates,
          requestedMajorCount,
          targetMin,
          targetMax,
          constraints,
          requiredMajorCourses,
          requiredElectiveCourses
        )
      : null;

  const lines: string[] = [];
  lines.push("Detected hard constraints from the student's latest request:");
  if (constraints.targetUnitsMin != null && constraints.targetUnitsMax != null) {
    lines.push(`- Total units must be ${constraints.targetUnitsMin}-${constraints.targetUnitsMax}.`);
  }
  if (requestedMajorCount > 0) {
    lines.push(
      `- Include exactly ${requestedMajorCount} course(s) from ${
        programName || "the student's major"
      } requirements.`
    );
  }
  if (rawRequiredCourseCodes.length > 0) {
    lines.push(`- Explicitly requested course(s): ${rawRequiredCourseCodes.join(", ")}.`);
  }
  if (constraints.needsUntaken) {
    lines.push("- Exclude every course already listed as completed by the student.");
  }
  if (completed.size > 0) {
    lines.push(`- Completed courses to exclude: ${Array.from(completed).join(", ")}.`);
  }
  if (constraints.forbiddenDays.length > 0) {
    lines.push(`- No meetings on ${formatDayList(constraints.forbiddenDays)}.`);
  }
  if (constraints.earliestStartMinutes != null) {
    lines.push(`- No meetings before ${minutesToDisplay(constraints.earliestStartMinutes)}.`);
  }
  if (constraints.latestEndMinutes != null) {
    lines.push(`- No meetings after ${minutesToDisplay(constraints.latestEndMinutes)}.`);
  }
  if (constraints.blockedTimes.length > 0) {
    lines.push(
      "- Avoid blocked windows: " +
        constraints.blockedTimes
          .map(
            (slot) =>
              `${formatDayList([slot.day])} ${minutesToDisplay(slot.start)}-${minutesToDisplay(slot.end)}`
          )
          .join(", ") +
        "."
    );
  }
  if (studentBlockedTimeLines.length > 0) {
    lines.push(
      "- Schedule planner blocks marked by the student: " +
        studentBlockedTimeLines.join("; ") +
        "."
    );
  }
  if (plannedSectionLines.length > 0) {
    lines.push(
      "- Treat current Schedule Planner classes as unavailable time: " +
        plannedSectionLines.join("; ") +
        "."
    );
  }
  if (constraints.preferredGeAreas.length > 0) {
    lines.push(`- Prefer GE area(s): ${constraints.preferredGeAreas.join(", ")}.`);
  }
  if (constraints.requireOpenSeats) {
    lines.push("- Use only sections with open seats.");
  }
  if (constraints.requiredModality) {
    lines.push(`- Use only ${constraints.requiredModality} sections.`);
  }
  lines.push("- Do not use unnamed placeholder electives; every course must be named.");

  if (requiredCourseBlockers.length > 0) {
    lines.push("Requested course blockers:");
    for (const blocker of requiredCourseBlockers) {
      lines.push(`- ${blocker}`);
    }
  }

  if (majorCandidates.length > 0) {
    lines.push(
      `Remaining offered major-course candidates (${CURRENT_TERM_LABEL}): ` +
        majorCandidates
          .slice(0, 18)
          .map((course) => `${normalizeCourseCode(course.code)} (${parseUnits(course.units)} units)`)
          .join(", ") +
        "."
    );
  }

  if (!plan) {
    lines.push(
      "No verified full schedule candidate was generated automatically. If you cannot name courses that satisfy all constraints, ask a clarifying question or say no valid schedule was found."
    );
    return lines.join("\n");
  }

  const totalUnits = plan.reduce((sum, course) => sum + course.units, 0);
  lines.push(
    `Verified schedule candidate satisfying the constraints (${totalUnits} units total):`
  );
  for (const course of plan) {
    lines.push(
      `- ${course.kind === "major" ? "Major" : "Elective"}: ${course.code} — ${course.title} (${course.units} units)${
        course.section ? `; selected section ${formatSelectedSection(course.section)}` : ""
      }`
    );
  }
  lines.push("Use these exact course codes and selected CRNs in the schedule block:");
  lines.push("[SCHEDULE_BLOCK]");
  lines.push(plan.map(formatScheduleBlockEntry).join(", "));
  lines.push("[/SCHEDULE_BLOCK]");
  lines.push(
    "If you include course cards, use the selected section CRNs above. If you choose a different schedule, recompute the total units and exact major-course count before answering."
  );

  return lines.join("\n");
}

function createAssistantTextResponse(text: string): Response {
  const id = `msg_${Math.random().toString(36).slice(2)}`;
  const stream = createUIMessageStream<UIMessage>({
    execute: ({ writer }) => {
      writer.write({ type: "start" });
      writer.write({ type: "start-step" });
      writer.write({ type: "text-start", id });
      writer.write({ type: "text-delta", id, delta: text });
      writer.write({ type: "text-end", id });
      writer.write({ type: "finish-step" });
      writer.write({ type: "finish", finishReason: "stop" });
    },
  });
  return createUIMessageStreamResponse({ stream });
}

function formatDeterministicScheduleResponse(guidance: string): string | null {
  if (!guidance.includes("Verified schedule candidate satisfying the constraints")) {
    return null;
  }

  const totalUnits = guidance.match(/\((\d+(?:\.\d+)?) units total\)/)?.[1];
  const block = guidance.match(/\[SCHEDULE_BLOCK\]\n([\s\S]*?)\n\[\/SCHEDULE_BLOCK\]/)?.[1];
  const courseLines = guidance
    .split("\n")
    .filter((line) => /^- (Major|Elective): /.test(line));

  if (!totalUnits || !block || courseLines.length === 0) return null;

  const majorLineCount = courseLines.filter((line) => line.startsWith("- Major: ")).length;
  const formattedCourses = courseLines.map((line) => {
    const match = line.match(
      /^- (Major|Elective): ([A-Z]{2,5} \d{1,3}[A-Z]?) — (.*?) \((\d+(?:\.\d+)?) units\)(?:; selected section (.*))?$/
    );
    if (!match) return line;
    const [, kind, code, title, units, section] = match;
    return `- ${code} — ${decodeHtmlEntities(title)} (${units} units, ${kind.toLowerCase()})${
      section ? `; ${decodeHtmlEntities(section)}` : ""
    }`;
  });

  return [
    majorLineCount > 0
      ? `Here’s a verified ${totalUnits}-unit schedule that satisfies your constraints. It includes exactly the requested number of remaining major courses and names every elective needed to reach the unit range.`
      : `Here’s a verified ${totalUnits}-unit schedule that satisfies your constraints and names every course needed to reach the unit range.`,
    "",
    "Selected courses:",
    ...formattedCourses,
    "",
    `Total: ${totalUnits} units.`,
    "",
    "[SCHEDULE_BLOCK]",
    block,
    "[/SCHEDULE_BLOCK]",
  ].join("\n");
}

function formatDeterministicScheduleFailureResponse(guidance: string): string {
  const blockers: string[] = [];
  const lines = guidance.split("\n");
  const blockerStart = lines.indexOf("Requested course blockers:");
  if (blockerStart >= 0) {
    for (const line of lines.slice(blockerStart + 1)) {
      if (!line.startsWith("- ")) break;
      blockers.push(line.slice(2));
    }
  }

  const response = [
    "I couldn’t verify a schedule that satisfies all of those constraints with the completed courses and current-term section data I have.",
  ];
  if (blockers.length > 0) {
    response.push("", "The blocker I found:");
    response.push(...blockers.map((blocker) => `- ${decodeHtmlEntities(blocker)}`));
  }
  response.push(
    "",
    "I’d rather stop there than invent a schedule that silently drops a requirement. Confirm any missing completed prerequisites, or loosen one constraint like the unit range, requested course, or unavailable times."
  );
  return response.join("\n");
}

function isSectionRecommendationQuery(query: string): boolean {
  if (/\b(?:prereq|prerequisite|eligible|eligibility|can\s+i\s+take|requirement|requirements)\b/i.test(query)) {
    return false;
  }
  return /\b(?:section|crn|meeting|time|fits?|fit\s+around|schedule\s+blocks?|blocked\s+times?|recommend|suggest|find|pick|choose)\b/i.test(
    query
  );
}

function formatCourseCardBlock(course: Course, section: Section): string {
  const meetings = section.meetings
    ?.map((meeting) => {
      const days = meeting.days?.join("") || "";
      if (!days || !meeting.startTime || !meeting.endTime) return null;
      return { days, time: `${meeting.startTime}-${meeting.endTime}` };
    })
    .filter((meeting): meeting is { days: string; time: string } =>
      Boolean(meeting)
    ) || [];
  const seats =
    section.seatsAvailable != null && section.seatsTotal != null
      ? `${section.seatsAvailable}/${section.seatsTotal}`
      : undefined;
  const ge = course.ge_areas?.length ? course.ge_areas.join(", ") : undefined;
  const lines = [
    "[COURSE_CARD]",
    `course_code: ${normalizeCourseCode(course.code)}`,
    `title: ${decodeHtmlEntities(course.title)}`,
    `units: ${parseUnits(course.units)}`,
    `description: ${decodeHtmlEntities(course.description || course.title).slice(0, 180)}`,
  ];
  if (ge) lines.push(`ge_areas: ${ge}`);
  if (meetings.length > 0) {
    lines.push(`days: ${meetings.map((meeting) => meeting.days).join("; ")}`);
    lines.push(`time: ${meetings.map((meeting) => meeting.time).join("; ")}`);
  }
  if (section.instructors?.length) {
    lines.push(`instructor: ${section.instructors.join(", ")}`);
  }
  lines.push(`crn: ${section.crn}`);
  if (seats) lines.push(`seats: ${seats}`);
  lines.push("[/COURSE_CARD]");
  return lines.join("\n");
}

async function buildDirectSectionRecommendation(
  query: string,
  studentContext: StudentContext | null
): Promise<string | null> {
  const scheduleConstraints = parseScheduleRequest(query);
  if (scheduleConstraints.isScheduleRequest || !isSectionRecommendationQuery(query)) {
    return null;
  }
  mergeStudentScheduleStateIntoConstraints(scheduleConstraints, studentContext);

  const allCourses = await loadAllCourses();
  const courseByCode = new Map(
    allCourses.map((course) => [normalizeCourseCode(course.code), course])
  );
  const completed = new Set(
    (studentContext?.completedCourses || []).map(normalizeCourseCode)
  );
  const plannedCourseCodes = new Set(
    (studentContext?.plannedSections || []).map((section) =>
      normalizeCourseCode(section.courseCode)
    )
  );
  const offeredCodes = loadCurrentSectionCodes();

  const explicitCodes = Array.from(
    new Set(
      extractCourseCodeTokens(query)
        .map(normalizeCourseCode)
        .filter((code) => offeredCodes.has(code))
    )
  );

  let course: Course | undefined;
  let searchedMajorRequirements = false;
  if (explicitCodes.length > 0) {
    course = courseByCode.get(explicitCodes[0]);
  } else if (/\bmajor\b/i.test(query)) {
    searchedMajorRequirements = true;
    const programName = studentContext?.targetMajor || studentContext?.major || "";
    const majorCodes: string[] = [];
    const majorSet = new Set<string>();
    if (programName) {
      for (const requirement of loadProgramRequirements(programName)) {
        for (const rawCourse of requirement.courses || []) {
          for (const code of extractRequirementCodes(rawCourse)) {
            if (majorSet.has(code)) continue;
            majorSet.add(code);
            majorCodes.push(code);
          }
        }
      }
    }
    course = majorCodes
      .filter((code) => !completed.has(code))
      .filter((code) => !plannedCourseCodes.has(code))
      .filter((code) => offeredCodes.has(code))
      .map((code) => courseByCode.get(code))
      .filter((candidate): candidate is Course => Boolean(candidate))
      .filter((candidate) => coursePrereqsLikelySatisfied(candidate, completed))
      .filter(
        (candidate) =>
          candidateSectionsForCode(normalizeCourseCode(candidate.code), scheduleConstraints).length > 0
      )
      .sort((a, b) => {
        const aNum = courseNumber(a.code);
        const bNum = courseNumber(b.code);
        const aUpper = aNum >= 100 && aNum < 200 ? 0 : 1;
        const bUpper = bNum >= 100 && bNum < 200 ? 0 : 1;
        if (aUpper !== bUpper) return aUpper - bUpper;
        return majorCodes.indexOf(normalizeCourseCode(a.code)) -
          majorCodes.indexOf(normalizeCourseCode(b.code));
      })[0];
  }

  if (!course) {
    if (searchedMajorRequirements) {
      return "I could not verify an untaken major course with satisfied prerequisites and a section that avoids your marked schedule blocks/current Schedule Planner classes. I would rather not recommend a class that conflicts or appears ineligible.";
    }
    return null;
  }

  const code = normalizeCourseCode(course.code);
  if (completed.has(code)) {
    return `${code} is already marked complete in your degree audit/profile, so I would not recommend taking it again unless you are intentionally retaking it.`;
  }
  if (plannedCourseCodes.has(code)) {
    return `${code} is already in your Schedule Planner, so I would not recommend adding it again.`;
  }
  if (!coursePrereqsLikelySatisfied(course, completed)) {
    const prereqs =
      typeof course.prerequisites === "string"
        ? course.prerequisites
        : course.prerequisites.join("; ");
    return `I would not recommend ${code} yet because your completed courses do not appear to satisfy its prerequisites: ${prereqs || "no prerequisite text available"}.`;
  }

  const section = candidateSectionsForCode(code, scheduleConstraints)[0];
  if (!section) {
    return `I could not find a ${CURRENT_TERM_LABEL} section of ${code} that avoids your marked schedule blocks and current Schedule Planner classes.`;
  }

  return [
    `A verified section that fits your current marked schedule constraints is ${code} — ${decodeHtmlEntities(course.title)}: ${formatSelectedSection(section)}.`,
    "",
    formatCourseCardBlock(course, section),
  ].join("\n");
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function isRecommendationLikeQuery(query: string): boolean {
  return /schedul|recommend|suggest|fit|around|add|pick|choose|take|build|plan|best|open section/i.test(
    query
  );
}

function findRelevantSections(
  query: string,
  courseMentions: Course[],
  studentContext: StudentContext | null = null
): string[] {
  if (!sectionCache) sectionCache = loadSectionsFile();
  const q = query.toUpperCase();
  const applyStudentConstraints = isRecommendationLikeQuery(query);
  const completed = new Set(
    (studentContext?.completedCourses || []).map(normalizeCourseCode)
  );
  const constraints = parseScheduleRequest(query);
  mergeStudentScheduleStateIntoConstraints(constraints, studentContext);

  // Check if the user is asking for a schedule (multi-course request)
  const isScheduleRequest =
    /schedul|build.*schedule|suggest.*schedule|course.*schedule|plan.*schedule/i.test(
      query
    );

  // Use extracted course codes as high-priority keys
  const targetCodes = new Set(courseMentions.map((c) => c.code.toUpperCase()));

  // Find sections matching target codes OR raw query
  const directMatched = sectionCache.filter((s) => {
    const code = s.courseCode.toUpperCase();
    if (applyStudentConstraints) {
      const normalizedCode = normalizeCourseCode(s.courseCode);
      if (completed.has(normalizedCode)) return false;
      if (!sectionSatisfiesScheduleConstraints(s, constraints)) return false;
    }
    return (
      targetCodes.has(code) ||
      code.includes(q) ||
      s.title.toUpperCase().includes(q) ||
      s.instructors.some((i) => i.toUpperCase().includes(q))
    );
  });

  if (!isScheduleRequest) {
    return directMatched.slice(0, 15).map(formatSectionForPrompt);
  }

  // Expanded schedule logic...
  const mentionedSubjects = new Set<string>();
  for (const code of targetCodes) {
    mentionedSubjects.add(code.split(" ")[0]);
  }

  // Gather broader sections from the same subjects
  const seenCourses = new Set<string>();
  const broadSections: Section[] = [];

  for (const s of directMatched) {
    const key = s.courseCode;
    if (!seenCourses.has(key)) {
      seenCourses.add(key);
      broadSections.push(s);
    }
  }

  for (const subj of mentionedSubjects) {
    for (const s of sectionCache) {
      if (s.subject.toUpperCase() !== subj) continue;
      const key = s.courseCode;
      if (seenCourses.has(key)) continue;
      const hasTimes = s.meetings?.some((m) => m.startTime && m.endTime);
      if (!hasTimes) continue;
      if (applyStudentConstraints) {
        const normalizedCode = normalizeCourseCode(s.courseCode);
        if (completed.has(normalizedCode)) continue;
        if (!sectionSatisfiesScheduleConstraints(s, constraints)) continue;
      }
      seenCourses.add(key);
      broadSections.push(s);
      if (broadSections.length >= 30) break;
    }
    if (broadSections.length >= 30) break;
  }

  return broadSections.slice(0, 30).map(formatSectionForPrompt);
}

const tools = {
  getCourseDetails: tool({
    description: `Lookup detailed information for ${CURRENT_TERM_LABEL} courses by code (e.g. 'ECS 036A').`,
    inputSchema: z.object({
      codes: z.array(z.string()).describe("List of course codes to lookup"),
    }),
    execute: async ({ codes }: { codes: string[] }) => {
      const all = await loadAllCourses();
      const normalize = (c: string) => c.toUpperCase().replace(/\s+/g, " ").trim();
      const normalizeCode = (c: string) => c.replace(/\s+/g, " ").trim();
      
      const targets = new Set(codes.map(normalize));
      const results = all.filter(c => targets.has(normalizeCode(c.code)));
      return results.map(formatCourseForPrompt);
    },
  }),
  getSections: tool({
    description: `Get live section times, instructors, and seat availability for ${CURRENT_TERM_LABEL}.`,
    inputSchema: z.object({
      query: z.string().describe("Course code, subject, or instructor name"),
    }),
    execute: async ({ query }: { query: string }) => {
      if (!sectionCache) sectionCache = loadSectionsFile();
      const q = query.toUpperCase();
      const matches = sectionCache.filter(s => 
        s.courseCode.toUpperCase().includes(q) || 
        s.title.toUpperCase().includes(q) ||
        s.instructors.some(i => i.toUpperCase().includes(q))
      );
      return matches.slice(0, 20).map(formatSectionForPrompt);
    },
  }),
  getGrades: tool({
    description: "Retrieve historical grade distribution and average GPA data for courses.",
    inputSchema: z.object({
      codes: z.array(z.string()).describe("List of course codes to check grades for"),
    }),
    execute: async ({ codes }: { codes: string[] }) => {
      const grades = loadGradesData();
      const results: string[] = [];
      for (const code of codes) {
        const g = grades[code.toUpperCase().replace(/\s+/g, " ")];
        if (g && g.overall_gpa != null) {
          let snippet = `Grade data for ${code}: Overall GPA ${g.overall_gpa}, ${g.overall_enrolled} students.`;
          if (g.overall_grades) {
            const dist = g.overall_grades;
            const total = Object.values(dist).reduce((a, b) => a + b, 0);
            if (total > 0) {
              const pct = (grade: string) => dist[grade] ? Math.round((dist[grade] / total) * 100) : 0;
              snippet += ` Distribution: A+/A/A- ${pct('A+') + pct('A') + pct('A-')}%, B+/B/B- ${pct('B+') + pct('B') + pct('B-')}%, C+/C/C- ${pct('C+') + pct('C') + pct('C-')}%, D/F ${pct('D+') + pct('D') + pct('D-') + pct('F')}%.`;
            }
          }
          if (g.professors && g.professors.length > 0) {
            const topProfs = g.professors
              .filter((p) => (p.totalEnrolled || 0) > 20)
              .sort((a, b) => (b.totalGpa || 0) - (a.totalGpa || 0))
              .slice(0, 5);
            if (topProfs.length > 0) {
              snippet += ` Professors by GPA: ${topProfs
                .map((p) => `${p.name || "Unknown"} (${p.totalGpa})`)
                .join("; ")}.`;
            }
          }
          results.push(snippet);
        }
      }
      return results;
    },
  }),
  searchCourses: tool({
    description: `Search ${CURRENT_TERM_LABEL} offered courses by keyword, description, or GE area.`,
    inputSchema: z.object({
      keyword: z.string().optional().describe("Keyword to search in title or description"),
      geArea: z.string().optional().describe("GE area code (e.g. 'SE', 'AH', 'SS')"),
    }),
    execute: async ({ keyword, geArea }: { keyword?: string; geArea?: string }) => {
      const all = await loadAllCourses();
      let results = all;
      if (geArea) {
        const areaUpper = geArea.toUpperCase();
        results = results.filter(c => c.ge_areas.includes(areaUpper));
      }
      if (keyword) {
        const keyLower = keyword.toLowerCase();
        results = results.filter(c => 
          c.title.toLowerCase().includes(keyLower) || 
          c.description.toLowerCase().includes(keyLower) ||
          c.code.toLowerCase().includes(keyLower)
        );
      }
      return results.slice(0, 15).map(formatCourseForPrompt);
    },
  }),
};

export async function POST(req: Request) {
  const { messages, studentContext } = (await req.json()) as {
    messages: UIMessage[];
    studentContext: StudentContext | null;
  };

  const lastUserMessage = getLastUserText(messages);

  let directScheduleResponse: string | null = null;
  let directScheduleGuidance: string | null = null;
  try {
    directScheduleGuidance = await buildScheduleGuidance(
      lastUserMessage,
      studentContext ?? null
    );
    directScheduleResponse = directScheduleGuidance
      ? formatDeterministicScheduleResponse(directScheduleGuidance)
      : null;
  } catch {}

  if (directScheduleResponse) {
    return createAssistantTextResponse(directScheduleResponse);
  }

  const directScheduleConstraints = parseScheduleRequest(lastUserMessage);
  if (
    directScheduleGuidance &&
    directScheduleConstraints.isScheduleRequest &&
    (directScheduleConstraints.targetUnitsMin != null ||
      directScheduleConstraints.majorCourseCount != null ||
      directScheduleConstraints.requiredCourseCodes.length > 0)
  ) {
    return createAssistantTextResponse(
      formatDeterministicScheduleFailureResponse(directScheduleGuidance)
    );
  }

  try {
    const directSectionRecommendation = await buildDirectSectionRecommendation(
      lastUserMessage,
      studentContext ?? null
    );
    if (directSectionRecommendation) {
      return createAssistantTextResponse(directSectionRecommendation);
    }
  } catch {}

  let relevantChunks: string[] = [];
  try {
    relevantChunks = await retrieve(lastUserMessage);
  } catch {}

  if (shouldIncludeProgramRequirementContext(lastUserMessage)) {
    const completedForProgramContext = new Set(
      (studentContext?.completedCourses || []).map(normalizeCourseCode)
    );
    const programNames = Array.from(
      new Set(
        [
          studentContext?.targetMajor,
          studentContext?.major,
          studentContext?.secondaryMajor,
          ...(studentContext?.minors || []),
        ].filter((name): name is string => Boolean(name))
      )
    );
    const programRequirementChunks = programNames
      .map((programName) =>
        formatProgramRequirementsForPrompt(programName, completedForProgramContext)
      )
      .filter((chunk): chunk is string => Boolean(chunk));
    relevantChunks = [...programRequirementChunks, ...relevantChunks];
  }

  let courseMentions: Course[] = [];
  try {
    courseMentions = await extractCourseMentions(lastUserMessage);
  } catch {}

  const mentionedCourses: string[] = courseMentions.map(formatCourseForPrompt);

  let sectionSnippets: string[] = [];
  try {
    sectionSnippets = findRelevantSections(
      lastUserMessage,
      courseMentions,
      studentContext ?? null
    );
  } catch {}

  let scheduleGuidance: string[] = [];
  try {
    const guidance = await buildScheduleGuidance(
      lastUserMessage,
      studentContext ?? null
    );
    if (guidance) scheduleGuidance = [guidance];
  } catch {}

  // Enrich with initial grade data for mentioned courses (immediate display)
  const gradeSnippets: string[] = [];
  try {
    const grades = loadGradesData();
    for (const c of courseMentions) {
      const g = grades[c.code];
      if (g && g.overall_gpa != null) {
        gradeSnippets.push(`Immediate grade context for ${c.code}: Avg GPA ${g.overall_gpa}.`);
      }
    }
  } catch {}

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: buildSystemPrompt(
      studentContext ?? null,
      relevantChunks,
      mentionedCourses,
      sectionSnippets,
      gradeSnippets,
      scheduleGuidance
    ),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: ({ steps }) => steps.length >= 5, // Stop after 5 steps
  });

  return result.toUIMessageStreamResponse();
}
