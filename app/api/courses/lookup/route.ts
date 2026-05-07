import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { normalizeCourseCode } from "@/lib/course-code";
import type { Section } from "@/lib/course-data";
import { CURRENT_SECTIONS_FILE, CURRENT_TERM_LABEL } from "@/lib/current-term";

interface CatalogCourse {
  code: string;
  title: string;
  units: number | string;
  description: string;
  prerequisites: string | string[];
  offered?: string[];
  ge_areas: string[];
  department: string;
}

interface CatalogCourseWithAvailability extends CatalogCourse {
  currentTerm: string;
  currentTermSectionCount: number;
  offeredThisTerm: boolean;
}

let cached: CatalogCourse[] | null = null;
let sectionCountsCached: Map<string, number> | null = null;

function loadCourses(): CatalogCourse[] {
  if (cached) return cached;
  const dataDir = path.join(process.cwd(), "data");
  const byCode = new Map<string, CatalogCourse>();

  for (const fileName of ["courses.json", "courses-full.json"]) {
    try {
      const raw = fs.readFileSync(path.join(dataDir, fileName), "utf-8");
      const courses = JSON.parse(raw) as CatalogCourse[];
      for (const course of courses) {
        const code = normalizeCourseCode(course.code);
        byCode.set(code, { ...course, code });
      }
    } catch {}
  }

  try {
    const raw = fs.readFileSync(
      path.join(dataDir, "sections", CURRENT_SECTIONS_FILE),
      "utf-8"
    );
    const sections = JSON.parse(raw) as Section[];
    for (const section of sections) {
      if (section.term !== CURRENT_TERM_LABEL) continue;
      const code = normalizeCourseCode(section.courseCode);
      const existing = byCode.get(code);
      byCode.set(code, {
        code,
        title: existing?.title || section.title,
        units: existing?.units || section.units,
        description: existing?.description || "",
        prerequisites: existing?.prerequisites || [],
        ge_areas: Array.from(new Set([...(existing?.ge_areas || []), ...(section.geAreas || [])])),
        department: existing?.department || section.subject,
      });
    }
  } catch {}

  cached = Array.from(byCode.values());
  return cached!;
}

function loadCurrentTermSectionCounts(): Map<string, number> {
  if (sectionCountsCached) return sectionCountsCached;
  const counts = new Map<string, number>();
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "data", "sections", CURRENT_SECTIONS_FILE),
      "utf-8"
    );
    const sections = JSON.parse(raw) as Section[];
    for (const section of sections) {
      if (section.term !== CURRENT_TERM_LABEL) continue;
      const code = normalizeCourseCode(section.courseCode);
      counts.set(code, (counts.get(code) || 0) + 1);
    }
  } catch {}
  sectionCountsCached = counts;
  return counts;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const codes = url.searchParams.get("codes");

  if (!codes) {
    return NextResponse.json({ courses: [] });
  }

  const requestedCodes = codes
    .split(",")
    .map((c) => normalizeCourseCode(c))
    .filter(Boolean);

  const allCourses = loadCourses();
  const sectionCounts = loadCurrentTermSectionCounts();
  const found: CatalogCourseWithAvailability[] = [];

  for (const code of requestedCodes) {
    const course = allCourses.find((c) => normalizeCourseCode(c.code) === code);
    if (course) {
      const currentTermSectionCount = sectionCounts.get(code) || 0;
      found.push({
        ...course,
        currentTerm: CURRENT_TERM_LABEL,
        currentTermSectionCount,
        offeredThisTerm: currentTermSectionCount > 0,
      });
    }
  }

  return NextResponse.json({ courses: found });
}
