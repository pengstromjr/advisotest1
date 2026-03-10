import type { Course } from "./course-data";

let cachedCourses: Course[] | null = null;
let codeIndex: Map<string, Course> | null = null;
let deptIndex: Map<string, Course[]> | null = null;

async function loadCourses(): Promise<Course[]> {
  if (cachedCourses) return cachedCourses;

  let data: Course[];
  try {
    const full = await import("@/data/courses-full.json");
    data = full.default as Course[];
  } catch {
    const fallback = await import("@/data/courses.json");
    data = fallback.default as Course[];
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

export async function extractCourseMentions(
  text: string
): Promise<Course[]> {
  await loadCourses();
  const regex = /\b([A-Z]{2,4})\s+(\d{3}[A-Z]?)\b/g;
  const found: Course[] = [];
  const seen = new Set<string>();
  let match;

  while ((match = regex.exec(text.toUpperCase())) !== null) {
    const code = `${match[1]} ${match[2]}`;
    if (!seen.has(code)) {
      seen.add(code);
      const course = codeIndex?.get(code);
      if (course) found.push(course);
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
