import type { Course } from "./course-data";
import { findCourseByCode } from "./course-lookup";

export interface PrereqNode {
  code: string;
  title: string;
  children: PrereqNode[];
}

const COURSE_CODE_RE = /\b([A-Z]{2,12})\s*(\d{1,3}[A-Z]?)\b/g;

function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/\s+/g, " ").trim();
}

function padNumberToken(num: string): string | null {
  if (!/^\d+[A-Z]?$/.test(num)) return null;
  if (num.length > 2) return null;
  return num.replace(/^(\d+)([A-Z]?)$/, (_, d, l) => d.padStart(3, "0") + (l || ""));
}

async function resolveCourseCode(dept: string, num: string): Promise<string | null> {
  const base = normalizeCode(`${dept} ${num}`);
  const direct = await findCourseByCode(base);
  if (direct) return normalizeCode(direct.code);

  const padded = padNumberToken(num);
  if (padded) {
    const alt = await findCourseByCode(normalizeCode(`${dept} ${padded}`));
    if (alt) return normalizeCode(alt.code);
  }

  return null;
}

function prereqText(course: Course): string {
  if (Array.isArray(course.prerequisites)) return course.prerequisites.join(" ; ");
  return course.prerequisites || "";
}

async function extractPrereqCodes(course: Course): Promise<string[]> {
  const text = prereqText(course).toUpperCase();
  if (!text.trim()) return [];

  const found: string[] = [];
  const seen = new Set<string>();
  let m: RegExpExecArray | null;

  while ((m = COURSE_CODE_RE.exec(text)) !== null) {
    const dept = m[1];
    const num = m[2];
    const resolved = await resolveCourseCode(dept, num);
    if (!resolved) continue;
    if (seen.has(resolved)) continue;
    seen.add(resolved);
    found.push(resolved);
  }

  return found;
}

async function buildNode(
  code: string,
  opts: { maxDepth: number; visited: Set<string> }
): Promise<PrereqNode | null> {
  const normalized = normalizeCode(code);
  const course = await findCourseByCode(normalized);
  if (!course) return null;

  if (opts.visited.has(normalized)) {
    return { code: normalized, title: course.title, children: [] };
  }

  const nextVisited = new Set(opts.visited);
  nextVisited.add(normalized);

  let children: PrereqNode[] = [];
  if (opts.maxDepth > 0) {
    const prereqCodes = await extractPrereqCodes(course);
    const childNodes = await Promise.all(
      prereqCodes.map((c) =>
        buildNode(c, { maxDepth: opts.maxDepth - 1, visited: nextVisited })
      )
    );
    children = childNodes.filter(Boolean) as PrereqNode[];
  }

  return {
    code: normalizeCode(course.code),
    title: course.title,
    children,
  };
}

export async function getPrereqTree(
  courseCode: string,
  options?: { maxDepth?: number }
): Promise<PrereqNode | null> {
  const maxDepth = Math.max(0, options?.maxDepth ?? 5);
  return buildNode(courseCode, { maxDepth, visited: new Set() });
}

