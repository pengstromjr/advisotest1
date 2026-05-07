import { normalizeCourseCode, parseCourseCodeParts } from "./course-code";
import type { RequirementSection } from "./course-data";

export const ENGLISH_COMPOSITION_REQUIRED_UNITS = 8;

export type EnglishCompositionProfile =
  | "caes"
  | "biological-sciences"
  | "engineering"
  | "letters-science"
  | "generic";

export interface EnglishCompositionCourseInfo {
  units?: number | string;
}

export interface EnglishCompositionAppliedCourse {
  code: string;
  units: number;
  role: "lower" | "intermediate" | "upper" | "oral-option";
}

export interface EnglishCompositionProgress {
  completedUnits: number;
  requiredUnits: number;
  courses: EnglishCompositionAppliedCourse[];
  usedCodes: Set<string>;
  profile: EnglishCompositionProfile;
  summary: string;
  unmetNotes: string[];
}

const LOWER_COMPOSITION_CODES = new Set([
  "UWP 001",
  "UWP 001V",
  "UWP 001Y",
  "ENL 003",
  "ENL 003V",
  "COM 001",
  "COM 002",
  "COM 003",
  "COM 004",
  "NAS 005",
  "NAS 005V",
]);

const INTERMEDIATE_COMPOSITION_CODES = new Set(["UWP 048", "UWP 049"]);
const ORAL_OPTION_CODES = new Set(["CMN 001", "CMN 001V"]);
const UPPER_COMPOSITION_NUMBERS = new Set(["101", "102", "104"]);
const CAES_PRIMARY_WRITING_CODES = new Set([
  "ENL 003",
  "ENL 003V",
  "UWP 001",
  "UWP 001V",
  "UWP 001Y",
  "UWP 048",
  "UWP 049",
]);

const ENGINEERING_PROGRAM_RE =
  /\b(?:engineering|aerospace science|materials science)\b/i;
const BIOLOGICAL_SCIENCES_PROGRAM_RE =
  /\b(?:biological sciences|biochemistry|molecular biology|cell biology|evolution|ecology|biodiversity|genetics|genomics|microbiology|neurobiology|physiology|behavior|plant biology)\b/i;
const CAES_PROGRAM_RE =
  /\b(?:agricultural|environmental|animal science|wildlife|food science|nutrition|landscape architecture|human development|community(?: and)? regional development|sustainable agriculture|sustainable environmental design|global disease biology|plant sciences|entomology|viticulture|managerial economics|atmospheric science|hydrology)\b/i;
const LETTERS_SCIENCE_PROGRAM_RE =
  /\b(?:computer science|data science|english|economics|psychology|philosophy|history|political science|sociology|communication|comparative literature|statistics|mathematics|physics|chemistry|cinema|music|art history|linguistics|international relations|american studies|gender|religious studies|classics)\b/i;

function parseUnits(units: number | string | undefined): number {
  if (typeof units === "number") return Number.isFinite(units) ? units : 0;
  const parsed = parseFloat(String(units ?? ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function roleRank(role: EnglishCompositionAppliedCourse["role"]): number {
  return {
    lower: 0,
    intermediate: 1,
    upper: 2,
    "oral-option": 3,
  }[role];
}

export function englishCompositionRole(
  rawCode: string
): EnglishCompositionAppliedCourse["role"] | null {
  const code = normalizeCourseCode(rawCode);
  if (LOWER_COMPOSITION_CODES.has(code)) return "lower";
  if (INTERMEDIATE_COMPOSITION_CODES.has(code)) return "intermediate";
  if (ORAL_OPTION_CODES.has(code)) return "oral-option";

  const parts = parseCourseCodeParts(code);
  if (!parts || parts.subject !== "UWP") return null;

  if (UPPER_COMPOSITION_NUMBERS.has(parts.number)) return "upper";

  return null;
}

export function isEnglishCompositionCourseCode(code: string): boolean {
  return englishCompositionRole(code) !== null;
}

export function getEnglishCompositionProgress(
  completedCourses: string[],
  courseInfoMap: Record<string, EnglishCompositionCourseInfo> = {},
  options: {
    programName?: string;
    requirements?: RequirementSection[];
    profile?: EnglishCompositionProfile;
  } = {}
): EnglishCompositionProgress {
  const profile =
    options.profile ??
    inferEnglishCompositionProfile(options.programName, options.requirements);
  const seen = new Set<string>();
  const candidates: EnglishCompositionAppliedCourse[] = [];

  for (const rawCode of completedCourses) {
    const code = normalizeCourseCode(rawCode);
    if (seen.has(code)) continue;
    seen.add(code);

    const role = englishCompositionRole(code);
    if (!role) continue;

    const units = parseUnits(courseInfoMap[code]?.units) || 4;
    candidates.push({ code, units, role });
  }

  candidates.sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.code.localeCompare(b.code));
  const courses = selectCoursesForProfile(candidates, profile);
  const completedUnits = courses.reduce((sum, course) => sum + course.units, 0);
  const unmetNotes = getUnmetNotes(courses, profile);

  return {
    completedUnits,
    requiredUnits: ENGLISH_COMPOSITION_REQUIRED_UNITS,
    courses,
    usedCodes: new Set(courses.map((course) => course.code)),
    profile,
    summary: profileSummary(profile),
    unmetNotes,
  };
}

export function inferEnglishCompositionProfile(
  programName = "",
  requirements: RequirementSection[] = []
): EnglishCompositionProfile {
  const requirementText = requirements
    .map((section) => `${section.heading} ${(section.notes || []).join(" ")} ${(section.courses || []).join(" ")}`)
    .join(" ");

  if (/college\s+of\s+engineering|upper\s+division\s+writing\s+requirement/i.test(requirementText)) {
    return "engineering";
  }
  if (/to\s+include\s+4\s+upper\s+division\s+units|biology academic success center/i.test(requirementText)) {
    return "biological-sciences";
  }
  if (/after\s+completing\s+84\s+units|letters\s+and\s+science/i.test(requirementText)) {
    return "letters-science";
  }
  if (/CMN\s*001|College English Composition Requirement|English Composition & Communication/i.test(requirementText)) {
    return "caes";
  }

  if (ENGINEERING_PROGRAM_RE.test(programName)) return "engineering";
  if (BIOLOGICAL_SCIENCES_PROGRAM_RE.test(programName)) return "biological-sciences";
  if (CAES_PROGRAM_RE.test(programName)) return "caes";
  if (LETTERS_SCIENCE_PROGRAM_RE.test(programName)) return "letters-science";
  return "generic";
}

function capCourseUnits(
  course: EnglishCompositionAppliedCourse,
  remaining: number
): EnglishCompositionAppliedCourse | null {
  if (remaining <= 0 || course.units <= 0) return null;
  return { ...course, units: Math.min(course.units, remaining) };
}

function selectUntil(
  courses: EnglishCompositionAppliedCourse[],
  maxUnits: number
): EnglishCompositionAppliedCourse[] {
  const selected: EnglishCompositionAppliedCourse[] = [];
  let units = 0;
  for (const course of courses) {
    const capped = capCourseUnits(course, maxUnits - units);
    if (!capped) continue;
    selected.push(capped);
    units += capped.units;
    if (units >= maxUnits) break;
  }
  return selected;
}

function selectCoursesForProfile(
  candidates: EnglishCompositionAppliedCourse[],
  profile: EnglishCompositionProfile
): EnglishCompositionAppliedCourse[] {
  const lower = candidates.filter((course) => course.role === "lower");
  const intermediate = candidates.filter((course) => course.role === "intermediate");
  const upper = candidates.filter((course) => course.role === "upper");
  const writingPrimary = [...lower, ...intermediate, ...upper];
  const oral = candidates.filter((course) => course.role === "oral-option");

  if (profile === "letters-science" || profile === "engineering") {
    const selected = [
      ...selectUntil(lower, 4),
      ...selectUntil(upper, 4),
    ];
    return selectUntil(selected, ENGLISH_COMPOSITION_REQUIRED_UNITS);
  }

  if (profile === "biological-sciences") {
    const selected = selectUntil(upper, 4);
    const selectedCodes = new Set(selected.map((course) => course.code));
    selected.push(
      ...selectUntil(
        [...lower, ...intermediate, ...upper].filter(
          (course) => !selectedCodes.has(course.code)
        ),
        ENGLISH_COMPOSITION_REQUIRED_UNITS - selected.reduce((sum, course) => sum + course.units, 0)
      )
    );
    return selectUntil(selected, ENGLISH_COMPOSITION_REQUIRED_UNITS);
  }

  if (profile === "caes") {
    const primaryWriting = candidates.filter(isCaesPrimaryWritingCourse);
    const selected = selectUntil(primaryWriting, 4);
    if (selected.length === 0) return [];

    const selectedCodes = new Set(selected.map((course) => course.code));
    selected.push(
      ...selectUntil(
        [...lower, ...intermediate, ...upper, ...oral].filter(
          (course) => !selectedCodes.has(course.code)
        ),
        ENGLISH_COMPOSITION_REQUIRED_UNITS - selected.reduce((sum, course) => sum + course.units, 0)
      )
    );
    return selectUntil(selected, ENGLISH_COMPOSITION_REQUIRED_UNITS);
  }

  const selected = selectUntil(writingPrimary, ENGLISH_COMPOSITION_REQUIRED_UNITS);
  const selectedUnits = selected.reduce((sum, course) => sum + course.units, 0);
  if (selectedUnits < ENGLISH_COMPOSITION_REQUIRED_UNITS && selected.length > 0) {
    selected.push(
      ...selectUntil(oral, ENGLISH_COMPOSITION_REQUIRED_UNITS - selectedUnits)
    );
  }
  return selectUntil(selected, ENGLISH_COMPOSITION_REQUIRED_UNITS);
}

function isCaesPrimaryWritingCourse(course: EnglishCompositionAppliedCourse): boolean {
  return CAES_PRIMARY_WRITING_CODES.has(course.code) || course.role === "upper";
}

function hasRole(
  courses: EnglishCompositionAppliedCourse[],
  role: EnglishCompositionAppliedCourse["role"]
): boolean {
  return courses.some((course) => course.role === role);
}

function getUnmetNotes(
  courses: EnglishCompositionAppliedCourse[],
  profile: EnglishCompositionProfile
): string[] {
  const notes: string[] = [];
  const units = courses.reduce((sum, course) => sum + course.units, 0);
  if (units >= ENGLISH_COMPOSITION_REQUIRED_UNITS) return notes;

  if (profile === "caes") {
    if (!courses.some(isCaesPrimaryWritingCourse)) {
      notes.push("Needs one primary writing course such as ENL 003, UWP 001, UWP 048, UWP 049, UWP 101, UWP 102 series, or UWP 104 series.");
    } else {
      notes.push("Needs a second approved written/oral expression course such as CMN 001, COM 001-004, NAS 005, or another unselected ENL/UWP course.");
    }
    return notes;
  }

  if ((profile === "letters-science" || profile === "engineering") && !hasRole(courses, "lower")) {
    notes.push("Needs a lower-division composition course such as UWP 001, ENL 003, COM 001-004, or NAS 005.");
  }
  if (
    (profile === "letters-science" ||
      profile === "engineering" ||
      profile === "biological-sciences") &&
    !hasRole(courses, "upper")
  ) {
    notes.push("Needs an upper-division UWP 101, UWP 102 series, or UWP 104 series course.");
  }
  if (notes.length === 0) {
    notes.push("Needs another approved English Composition course for the remaining units.");
  }
  return notes;
}

function profileSummary(profile: EnglishCompositionProfile): string {
  if (profile === "letters-science") {
    return "L&S: one lower-division composition course plus one upper-division UWP 101/102/104 course.";
  }
  if (profile === "engineering") {
    return "Engineering: lower-division composition plus an approved upper-division writing course.";
  }
  if (profile === "biological-sciences") {
    return "Biological Sciences: 8 approved composition units, including 4 upper-division units.";
  }
  if (profile === "caes") {
    return "CA&ES-style: one primary ENL/UWP writing course plus one approved written/oral expression course.";
  }
  return "English Composition: 8 approved units as specified by the student’s college.";
}
