import { openai } from "@ai-sdk/openai";
import { streamText, type UIMessage, convertToModelMessages } from "ai";
import { retrieve } from "@/lib/rag";
import { buildSystemPrompt } from "@/lib/system-prompt";
import { extractCourseMentions } from "@/lib/course-lookup";
import type { StudentContext, Course } from "@/lib/course-data";

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

  const result = streamText({
    model: openai("gpt-4o-mini"),
    system: buildSystemPrompt(
      studentContext ?? null,
      relevantChunks,
      mentionedCourses
    ),
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
}
