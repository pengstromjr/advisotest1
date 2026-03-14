import { openai } from "@ai-sdk/openai";
import { streamText, type UIMessage, convertToModelMessages } from "ai";
import { retrieve } from "@/lib/rag";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { extractCourseMentions } from "@/lib/course-lookup";
import type { StudentContext, Course, Section } from "@/lib/course-data";
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
    const raw = fs.readFileSync(path.join(process.cwd(), "data", "rmp.json"), "utf-8");
    rmpCache = JSON.parse(raw);
  } catch {
    rmpCache = {};
  }
  return rmpCache!;
}

function loadGradesData(): Record<string, any> {
  if (gradesCache) return gradesCache;
  try {
    const raw = fs.readFileSync(path.join(process.cwd(), "data", "grades.json"), "utf-8");
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
    const fs = require("fs");
    const path = require("path");
    const raw = fs.readFileSync(
      path.join(process.cwd(), "data", "sections", "spring-2026.json"),
      "utf-8"
    );
    return JSON.parse(raw) as Section[];
  } catch {
    return [];
  }
}

let sectionCache: Section[] | null = null;

function findRelevantSections(query: string): string[] {
  if (!sectionCache) sectionCache = loadSectionsFile();
  const q = query.toUpperCase();

  // Check if the user is asking for a schedule (multi-course request)
  const isScheduleRequest = /schedul|build.*schedule|suggest.*schedule|course.*schedule|plan.*schedule/i.test(query);

  // First, find sections directly matching the query
  const directMatched = sectionCache.filter((s) => {
    const code = `${s.subject} ${s.courseNumber}`.toUpperCase();
    return (
      code.includes(q) ||
      s.title.toUpperCase().includes(q) ||
      s.instructors.some((i) => i.toUpperCase().includes(q))
    );
  });

  if (!isScheduleRequest) {
    return directMatched.slice(0, 15).map(formatSectionForPrompt);
  }

  // For schedule requests, also extract mentioned course codes and their subjects
  const courseCodeRegex = /([A-Z]{2,5})\s*(\d{3}[A-Z]?)/gi;
  const mentionedSubjects = new Set<string>();
  let codeMatch: RegExpExecArray | null;
  while ((codeMatch = courseCodeRegex.exec(query)) !== null) {
    mentionedSubjects.add(codeMatch[1].toUpperCase());
  }

  // If no specific subjects found, try to use the first word as a subject
  if (mentionedSubjects.size === 0) {
    const words = query.split(/\s+/);
    for (const w of words) {
      if (/^[A-Z]{2,5}$/i.test(w)) {
        mentionedSubjects.add(w.toUpperCase());
      }
    }
  }

  // Gather broader sections from the same subjects (1 lecture section per unique course)
  const seenCourses = new Set<string>();
  const broadSections: Section[] = [];

  // Add direct matches first
  for (const s of directMatched) {
    const key = s.courseCode;
    if (!seenCourses.has(key)) {
      seenCourses.add(key);
      broadSections.push(s);
    }
  }

  // Add other courses from the same subject(s)
  for (const subj of mentionedSubjects) {
    for (const s of sectionCache) {
      if (s.subject.toUpperCase() !== subj) continue;
      const key = s.courseCode;
      if (seenCourses.has(key)) continue;
      // Only pick sections with actual meeting times
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

export async function POST(req: Request) {
  const { messages, studentContext } = (await req.json()) as {
    messages: UIMessage[];
    studentContext: StudentContext | null;
  };

  const lastUserMessage = getLastUserText(messages);

  let relevantChunks: string[] = [];
  try {
    relevantChunks = await retrieve(lastUserMessage);
  } catch {
    // If embeddings aren't available yet, continue without RAG
  }

  let mentionedCourses: string[] = [];
  try {
    const courses = await extractCourseMentions(lastUserMessage);
    mentionedCourses = courses.map(formatCourseForPrompt);
  } catch {
    // If course data isn't available, continue without lookups
  }

  let sectionSnippets: string[] = [];
  try {
    sectionSnippets = findRelevantSections(lastUserMessage);
  } catch {
  }

  // Enrich course mentions with CattleLog grade data
  let gradeSnippets: string[] = [];
  try {
    const grades = loadGradesData();
    const courses = await extractCourseMentions(lastUserMessage);
    for (const c of courses) {
      const g = grades[c.code];
      if (g && g.overall_gpa != null) {
        let snippet = `Grade data for ${c.code}: Overall GPA ${g.overall_gpa}, ${g.overall_enrolled} students.`;
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
            .filter((p: any) => p.totalGpa != null && p.totalEnrolled > 20)
            .sort((a: any, b: any) => (b.totalGpa || 0) - (a.totalGpa || 0))
            .slice(0, 5);
          if (topProfs.length > 0) {
            snippet += ` Top professors by GPA: ${topProfs.map((p: any) => `${p.name} (${p.totalGpa}, ${p.totalEnrolled} students)`).join("; ")}.`;
          }
        }
        gradeSnippets.push(snippet);
      }
    }
  } catch {
    // Grade data not available
  }

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
  });

  return result.toUIMessageStreamResponse();
}
