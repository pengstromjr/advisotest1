import type { Course, Section } from "./course-data";
import { extractCourseCodeMatches, normalizeCourseCode } from "./course-code";
import { CURRENT_SECTIONS_FILE, CURRENT_TERM_LABEL } from "./current-term";

let cachedCourses: Course[] | null = null;
let codeIndex: Map<string, Course> | null = null;
let deptIndex: Map<string, Course[]> | null = null;

async function loadCourses(): Promise<Course[]> {
  if (cachedCourses) return cachedCourses;

  // Load base catalog (most complete), then overlay courses-full if available
  const base = await import("@/data/courses.json");
  let data: Course[] = base.default as Course[];
  try {
    const full = await import("@/data/courses-full.json");
    const fullData = full.default as Course[];
    if (fullData.length > 0) {
      const merged = new Map<string, Course>();
      for (const c of data) merged.set(normalizeCourseCode(c.code), c);
      for (const c of fullData) merged.set(normalizeCourseCode(c.code), c);
      data = Array.from(merged.values());
    }
  } catch {
    // courses-full.json not available — base is fine
  }

  try {
    const fs = await import("fs");
    const path = await import("path");
    const sectionsPath = path.join(
      process.cwd(),
      "data",
      "sections",
      CURRENT_SECTIONS_FILE
    );
    const sections = JSON.parse(fs.readFileSync(sectionsPath, "utf-8")) as Section[];
    const merged = new Map(data.map((course) => [normalizeCourseCode(course.code), course]));
    for (const section of sections) {
      if (section.term !== CURRENT_TERM_LABEL) continue;
      const code = normalizeCourseCode(section.courseCode);
      const existing = merged.get(code);
      merged.set(code, {
        code,
        title: existing?.title || section.title,
        units: existing?.units || section.units,
        description: existing?.description || "",
        prerequisites: existing?.prerequisites || [],
        offered: Array.from(new Set([...(existing?.offered || []), CURRENT_TERM_LABEL])),
        ge_areas: Array.from(new Set([...(existing?.ge_areas || []), ...(section.geAreas || [])])),
        department: existing?.department || section.subject,
      });
    }
    data = Array.from(merged.values());
  } catch {
    // Section-derived catalog coverage is best-effort.
  }

  cachedCourses = data;
  codeIndex = new Map();
  deptIndex = new Map();

  for (const c of data) {
    const normalizedCode = normalizeCourseCode(c.code);
    codeIndex.set(normalizedCode, c);

    const dept = c.department || normalizedCode.replace(/\s*\d.*$/, "");
    if (!deptIndex.has(dept)) deptIndex.set(dept, []);
    deptIndex.get(dept)!.push(c);
  }

  return data;
}

export async function findCourseByCode(
  code: string
): Promise<Course | undefined> {
  await loadCourses();
  const normalized = normalizeCourseCode(code);
  return codeIndex?.get(normalized);
}

export async function findCoursesByDepartment(
  dept: string
): Promise<Course[]> {
  await loadCourses();
  const normalized = dept.toUpperCase().trim();
  return deptIndex?.get(normalized) || [];
}

export async function findCoursesByGE(area: string): Promise<Course[]> {
  const courses = await loadCourses();
  const normalized = area.toUpperCase().trim();
  return courses.filter((c) =>
    c.ge_areas.some((g) => g.toUpperCase() === normalized)
  );
}

/** Full names and typos → official UC Davis subject code (uppercase). */
const NAME_TO_CODE: Record<string, string> = {
  PSYCH: "PSC",
  PSYCHOLOGY: "PSC",
  PSYC: "PSC",
  ACCOUNTING: "ACC",
  ACCOUNTANCY: "ACC",
  ACCT: "ACC",
  ECONOMICS: "ECN",
  ECON: "ECN",
  MATHEMATICS: "MAT",
  MATH: "MAT",
  ENGLISH: "ENL",
  BIOLOGY: "BIS",
  CHEMISTRY: "CHE",
  PHYSICS: "PHY",
  HISTORY: "HIS",
  SOCIOLOGY: "SOC",
  POLITICAL: "POL",
  PHILOSOPHY: "PHI",
  COMMUNICATION: "CMN",
  COMM: "CMN",
  STATISTICS: "STA",
  COMPUTER: "ECS",
  CALCULUS: "MAT",
};

function normalizeDeptToken(token: string): string {
  const upper = token.toUpperCase().trim();
  return NAME_TO_CODE[upper] ?? upper;
}

function resolveCourseCode(
  deptToken: string,
  num: string,
  suffix: string,
  index: Map<string, Course> | null
): Course | undefined {
  if (!index) return undefined;
  const dept = normalizeDeptToken(deptToken);
  return index.get(normalizeCourseCode(`${dept} ${num}${suffix}`));
}

/** Build canonical code for inferred (e.g. ACC 001A when user typed "Accounting 1A"). */
function inferredCode(deptToken: string, num: string, suffix: string): string {
  const dept = normalizeDeptToken(deptToken);
  return normalizeCourseCode(`${dept} ${num}${suffix}`);
}

/** Minimal course for transcript-inferred codes not in catalog. */
function inferredCourse(code: string): Course {
  return {
    code,
    title: code,
    units: "",
    description: "",
    prerequisites: [],
    offered: [],
    ge_areas: [],
    department: code.split(" ")[0],
  };
}

export async function extractCourseMentions(
  text: string
): Promise<Course[]> {
  await loadCourses();
  const found: Course[] = [];
  const seen = new Set<string>();
  for (const match of extractCourseCodeMatches(text)) {
    const deptToken = match.subject;
    const num = match.number;
    const suffix = match.suffix;
    const canonicalCode = inferredCode(deptToken, num, suffix);
    if (seen.has(canonicalCode)) continue;
    seen.add(canonicalCode);

    const course = resolveCourseCode(deptToken, num, suffix, codeIndex);
    if (course) {
      found.push(course);
    } else if (NAME_TO_CODE[deptToken]) {
      found.push(inferredCourse(canonicalCode));
    }
  }
  return found;
}

export async function getAllPrograms(): Promise<string[]> {
  try {
    const fs = await import("fs");
    const path = await import("path");
    const majorsDir = path.join(process.cwd(), "data", "majors");
    const files = fs.readdirSync(majorsDir).filter((f: string) => f.endsWith(".json"));
    return files.map((f: string) => {
      try {
        const raw = fs.readFileSync(path.join(majorsDir, f), "utf-8");
        const data = JSON.parse(raw);
        return data.name || f.replace(".json", "");
      } catch {
        return f.replace(".json", "");
      }
    });
  } catch {
    return ["Philosophy, B.A.", "Economics, B.A."];
  }
}

export async function getAllCourseCodes(): Promise<string[]> {
  const courses = await loadCourses();
  const codeSet = new Set(courses.map((c) => c.code));

  try {
    const fs = await import("fs");
    const path = await import("path");
    const majorsDir = path.join(process.cwd(), "data", "majors");
    const files = fs
      .readdirSync(majorsDir)
      .filter((f: string) => f.endsWith(".json"));
    for (const f of files) {
      try {
        const raw = fs.readFileSync(path.join(majorsDir, f), "utf-8");
        const data = JSON.parse(raw);
        if (data.requirements) {
          for (const req of data.requirements) {
            if (req.courses) {
              for (const code of req.courses) {
                if (typeof code === "string" && code.trim()) {
                  codeSet.add(code.trim());
                }
              }
            }
          }
        }
      } catch {
        /* skip malformed files */
      }
    }
  } catch {
    /* no majors dir */
  }

  return [...codeSet];
}
