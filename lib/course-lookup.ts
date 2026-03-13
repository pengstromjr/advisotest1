import type { Course } from "./course-data";

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
      for (const c of data) merged.set(c.code.toUpperCase().replace(/\s+/g, " "), c);
      for (const c of fullData) merged.set(c.code.toUpperCase().replace(/\s+/g, " "), c);
      data = Array.from(merged.values());
    }
  } catch {
    // courses-full.json not available — base is fine
  }

  cachedCourses = data;
  codeIndex = new Map();
  deptIndex = new Map();

  for (const c of data) {
    const normalizedCode = c.code.toUpperCase().replace(/\s+/g, " ");
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
  const normalized = code.toUpperCase().replace(/\s+/g, " ").trim();
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

/** Match dept (2–12 letters) + number: e.g. MAT 21A, ECN 001, PSYCH 001, ACCOUNTING 1A. */
const TRANSCRIPT_CODE_REGEX = /\b([A-Z]{2,12})\s*(\d{1,3}[A-Z]?)\b/g;

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
  index: Map<string, Course> | null
): Course | undefined {
  if (!index) return undefined;
  const dept = normalizeDeptToken(deptToken);
  const withSpace = `${dept} ${num}`;
  const course = index.get(withSpace);
  if (course) return course;
  const padded =
    num.length <= 2 && /^\d+[A-Z]?$/.test(num)
      ? num.replace(/^(\d+)([A-Z]?)$/, (_, d, l) =>
          d.padStart(3, "0") + (l || "")
        )
      : null;
  if (padded) {
    const alt = index.get(`${dept} ${padded}`);
    if (alt) return alt;
  }
  return undefined;
}

/** Build canonical code for inferred (e.g. ACC 001A when user typed "Accounting 1A"). */
function inferredCode(deptToken: string, num: string): string {
  const dept = normalizeDeptToken(deptToken);
  const padded =
    num.length <= 2 && /^\d+[A-Z]?$/.test(num)
      ? num.replace(/^(\d+)([A-Z]?)$/, (_, d, l) =>
          d.padStart(3, "0") + (l || "")
        )
      : null;
  return `${dept} ${padded ?? num}`;
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
  let match;
  const upper = text.toUpperCase();

  while ((match = TRANSCRIPT_CODE_REGEX.exec(upper)) !== null) {
    const deptToken = match[1];
    const num = match[2];
    const canonicalCode = inferredCode(deptToken, num);
    if (seen.has(canonicalCode)) continue;
    seen.add(canonicalCode);

    const course = resolveCourseCode(deptToken, num, codeIndex);
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
