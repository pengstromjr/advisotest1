import fs from "fs";
import path from "path";

type Course = { code?: string };
type Requirement = { heading?: string; courses?: unknown[] };
type Program = { name?: string; requirements?: Requirement[]; url?: string };

type MissingReference = {
  file: string;
  program: string;
  heading: string;
  reference: string;
};

const ROOT = process.cwd();
const COURSES_FILES = ["data/courses.json", "data/courses-full.json"];
const MAJORS_DIR = path.join(ROOT, "data", "majors");

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf-8")) as T;
}

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/\s+/g, " ").trim();
}

function expandCrossListedCode(reference: string): string[] {
  const normalized = normalizeCode(reference);
  const match = normalized.match(/^([A-Z]{2,6}(?:\/[A-Z]{2,6})+)\s+(\d{1,3}[A-Z]?)$/);
  if (!match) return [normalized];

  const departments = match[1].split("/");
  const number = match[2];
  return departments.map((dept) => `${dept} ${number}`);
}

function loadCourseCodes(): Set<string> {
  const codes = new Set<string>();
  for (const file of COURSES_FILES) {
    const courses = readJson<Course[]>(file);
    for (const course of courses) {
      if (course.code) codes.add(normalizeCode(course.code));
    }
  }
  return codes;
}

function isKnownReference(reference: string, courseCodes: Set<string>): boolean {
  return expandCrossListedCode(reference).some((code) => courseCodes.has(code));
}

function categorize(reference: string): string {
  const normalized = normalizeCode(reference);
  if (/DISCONTINUED|\*\*/.test(normalized)) return "discontinued-or-annotated";
  if (/^[A-Z]{2,6}\s+\d{3}[A-Z]?[A-Z]{2,6}\s+\d{3}[A-Z]?/.test(normalized)) return "concatenated-course-sequence";
  if (/^[A-Z]{2,6}\s+\d{3}[A-Z]?\d{3}[A-Z]?/.test(normalized)) return "concatenated-same-subject-sequence";
  if (/^[A-Z]{2,6}(?:\/[A-Z]{2,6}){2,}\s+\d{1,3}[A-Z]?$/.test(normalized)) return "multi-department-cross-listing";
  if (/^[A-Z]{2,6}(?:\/[A-Z]{2,6})+\s+\d{1,3}[A-Z]?$/.test(normalized)) return "cross-listing-missing-from-course-catalog";
  if (/^[A-Z]{2,6}\s+\d{1,3}[A-Z]?$/.test(normalized)) return "missing-from-course-catalog";
  return "other-format";
}

function main() {
  const courseCodes = loadCourseCodes();
  const files = fs.readdirSync(MAJORS_DIR).filter((file) => file.endsWith(".json")).sort();

  let totalReferences = 0;
  let knownReferences = 0;
  const missing: MissingReference[] = [];
  const categoryCounts = new Map<string, number>();
  const programCounts = new Map<string, number>();

  for (const file of files) {
    const program = JSON.parse(fs.readFileSync(path.join(MAJORS_DIR, file), "utf-8")) as Program;
    for (const requirement of program.requirements ?? []) {
      for (const value of requirement.courses ?? []) {
        if (typeof value !== "string" || !value.trim()) continue;
        totalReferences += 1;
        if (isKnownReference(value, courseCodes)) {
          knownReferences += 1;
          continue;
        }

        const record = {
          file,
          program: program.name ?? file,
          heading: requirement.heading ?? "Unknown requirement",
          reference: value,
        };
        missing.push(record);
        const category = categorize(value);
        categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
        programCounts.set(record.program, (programCounts.get(record.program) ?? 0) + 1);
      }
    }
  }

  const categorySummary = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1]);
  const topPrograms = [...programCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

  console.log(JSON.stringify({
    programFiles: files.length,
    courseCodes: courseCodes.size,
    totalRequirementCourseReferences: totalReferences,
    knownRequirementCourseReferences: knownReferences,
    missingRequirementCourseReferences: missing.length,
    knownReferenceCoverage: Number(((knownReferences / totalReferences) * 100).toFixed(1)),
    categorySummary,
    topPrograms,
    sampleMissingReferences: missing.slice(0, 50),
  }, null, 2));
}

main();
