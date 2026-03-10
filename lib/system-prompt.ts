import type { StudentContext } from "./course-data";

export function buildSystemPrompt(
  studentContext: StudentContext | null,
  ragChunks: string[],
  mentionedCourses: string[] = []
): string {
  const parts: string[] = [];

  parts.push(`You are a friendly and knowledgeable UC Davis academic advisor AI assistant. Your role is to help students navigate course requirements, prerequisites, degree planning, and academic policies.

Guidelines:
- Always refer to courses by their official code (e.g., "PHI 001", "ECN 100A").
- When discussing requirements, be specific about which courses satisfy them.
- If you are unsure or the information is not in your reference material, say so honestly rather than guessing.
- Keep responses concise but thorough. Use bullet points or numbered lists for clarity when listing courses or requirements.
- Be encouraging and supportive in tone, like a real academic advisor would be.
- Only answer questions related to UC Davis academics, courses, and degree planning. Politely redirect off-topic questions.
- When a student asks about remaining requirements, cross-reference their completed courses with the degree requirements to identify what's left.`);

  if (studentContext && studentContext.major) {
    const contextParts: string[] = ["Current student profile:"];
    if (studentContext.major) {
      contextParts.push(`- Major: ${studentContext.major}`);
    }
    if (studentContext.year) {
      contextParts.push(`- Year: ${studentContext.year}`);
    }
    if (studentContext.completedCourses?.length > 0) {
      contextParts.push(
        `- Completed courses: ${studentContext.completedCourses.join(", ")}`
      );
    }
    parts.push(contextParts.join("\n"));
  }

  if (mentionedCourses.length > 0) {
    parts.push(
      "Specific course details (exact data from the catalog):\n\n" +
        mentionedCourses.map((c, i) => `[Course ${i + 1}] ${c}`).join("\n\n")
    );
  }

  if (ragChunks.length > 0) {
    parts.push(
      "Reference material from the UC Davis course catalog and degree requirements:\n\n" +
        ragChunks.map((chunk, i) => `[${i + 1}] ${chunk}`).join("\n\n")
    );
  }

  return parts.join("\n\n");
}
