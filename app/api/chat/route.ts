import { openai } from "@ai-sdk/openai";
import { streamText, type UIMessage, convertToModelMessages } from "ai";
import { retrieve } from "@/lib/rag";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { extractCourseMentions } from "@/lib/course-lookup";
import type { StudentContext, Course, Section } from "@/lib/course-data";
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
let rmpCache: Record<string, any> | null = null;
let gradesCache: Record<string, any> | null = null;

function loadRmpData(): Record<string, any> {
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

function loadGradesData(): Record<string, any> {
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
      const profMatch = courseGrades.professors.find((p: any) =>
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

function findRelevantSections(query: string, courseMentions: Course[]): string[] {
  if (!sectionCache) sectionCache = loadSectionsFile();
  const q = query.toUpperCase();

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
            const total = Object.values(dist).reduce((a: number, b: any) => a + (b as number), 0);
            if (total > 0) {
              const pct = (grade: string) => dist[grade] ? Math.round((dist[grade] / total) * 100) : 0;
              snippet += ` Distribution: A+/A/A- ${pct('A+') + pct('A') + pct('A-')}%, B+/B/B- ${pct('B+') + pct('B') + pct('B-')}%, C+/C/C- ${pct('C+') + pct('C') + pct('C-')}%, D/F ${pct('D+') + pct('D') + pct('D-') + pct('F')}%.`;
            }
          }
          if (g.professors && g.professors.length > 0) {
            const topProfs = g.professors
              .filter((p: any) => p.totalEnrolled > 20)
              .sort((a: any, b: any) => (b.totalGpa || 0) - (a.totalGpa || 0))
              .slice(0, 5);
            if (topProfs.length > 0) {
              snippet += ` Professors by GPA: ${topProfs.map((p: any) => `${p.name} (${p.totalGpa})`).join("; ")}.`;
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

  let relevantChunks: string[] = [];
  try {
    relevantChunks = await retrieve(lastUserMessage);
  } catch {}

  let courseMentions: Course[] = [];
  try {
    courseMentions = await extractCourseMentions(lastUserMessage);
    const springOfferedCodes = loadCurrentSectionCodes();
    courseMentions = courseMentions.filter((course) =>
      springOfferedCodes.has(course.code)
    );
  } catch {}

  let mentionedCourses: string[] = courseMentions.map(formatCourseForPrompt);

  let sectionSnippets: string[] = [];
  try {
    sectionSnippets = findRelevantSections(lastUserMessage, courseMentions);
  } catch {}

  // Enrich with initial grade data for mentioned courses (immediate display)
  let gradeSnippets: string[] = [];
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
      gradeSnippets
    ),
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: ({ steps }) => steps.length >= 5, // Stop after 5 steps
  });

  return result.toUIMessageStreamResponse();
}
