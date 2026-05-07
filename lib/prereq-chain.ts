import type { Course } from "./course-data";
import { extractCourseCodeMatches, normalizeCourseCode } from "./course-code";
import { findCourseByCode } from "./course-lookup";

export interface PrereqNode {
  code: string;
  title: string;
  children: PrereqNode[];
}

function normalizeCode(code: string): string {
  return normalizeCourseCode(code);
}

async function resolveCourseCode(code: string): Promise<string | null> {
  const direct = await findCourseByCode(code);
  if (direct) return normalizeCode(direct.code);
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
  for (const match of extractCourseCodeMatches(text)) {
    const resolved = await resolveCourseCode(match.code);
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
