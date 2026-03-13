import { openai } from "@ai-sdk/openai";
import { streamText, type UIMessage, convertToModelMessages } from "ai";
import { retrieve } from "@/lib/rag";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { extractCourseMentions } from "@/lib/course-lookup";
import type { StudentContext, Course, Section } from "@/lib/course-data";

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
  return `${section.courseCode} ${section.section || ""} — CRN ${
    section.crn
  } with ${instructors}. Meetings: ${meetings}. ${seats}.`;
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

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: buildSystemPrompt(
      studentContext ?? null,
      relevantChunks,
      mentionedCourses,
      sectionSnippets
    ),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
