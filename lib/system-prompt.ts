import { getAdvisingGoals } from "./advising-goals";
import { ACADEMIC_PLANS, getAcademicPlan } from "./academic-plan";
import { CURRENT_TERM_LABEL } from "./current-term";
import type { StudentContext } from "./course-data";

export function buildSystemPrompt(
  studentContext: StudentContext | null,
  ragChunks: string[],
  mentionedCourses: string[] = [],
  sectionSnippets: string[] = [],
  gradeSnippets: string[] = []
): string {
  const parts: string[] = [];

  parts.push(`You are a friendly and knowledgeable academic advisor AI assistant called Adviso. Your role is to help students navigate course requirements, prerequisites, degree planning, and academic policies.

Guidelines:
- Always refer to courses by their official code (e.g., "PHI 001", "ECN 100A").
- When discussing requirements, be specific about which courses satisfy them.
- Treat catalog alternatives correctly: courses listed under "Choose one", "or", cross-listings, or V/Y delivery variants usually satisfy the same requirement. Do not tell a student they must take every listed variant unless the reference explicitly says all are required.
- If you are unsure or the information is not in your reference material, say so honestly rather than guessing.
- Keep responses concise but thorough. Use bullet points or numbered lists for clarity when listing courses or requirements.
- Be encouraging and supportive in tone, like a real academic advisor would be.
- Only answer questions related to academics, courses, and degree planning. Politely redirect off-topic questions.
- When a student asks about remaining requirements, cross-reference their completed courses with the degree requirements to identify what's left.
- You have access to Rate My Professors (RMP) data including instructor ratings, difficulty scores, and "would take again" percentages. You can share this data when students ask about instructors or want recommendations.
- You have access to CattleLog grade distribution data including historical GPAs, grade breakdowns (A+ through F), and per-professor grade distributions. Share this data when students ask about course difficulty, grade distributions, or want to compare instructors.

INTERACTIVE COURSE CARDS:
When you recommend a specific course and section data is available, include an interactive card the student can use to add it directly to their schedule. Use this exact format:

[COURSE_CARD]
course_code: ECS 036A
title: Programming & Problem Solving
units: 4
description: Brief one-sentence description of the course.
ge_areas: SE, QL
days: MWF
time: 10:00-10:50
instructor: Smith, J
crn: 62382
seats: 14/68
[/COURSE_CARD]

Rules for course cards:
- Only include a card when you are specifically recommending or suggesting a single course and have section data for it (CRN, times, etc.).
- The crn field is REQUIRED for the Add to Schedule button to work. Always include it if section data is available.
- Only include fields you have data for. Omit fields you don't know (like instructor, seats, days, time) rather than guessing.
- You can include multiple cards if recommending multiple courses.
- Always include some text explanation before or after the card(s).
- Do NOT put cards inside markdown code blocks — they must be at the top level of your response.

INTERACTIVE SCHEDULE BLOCKS:
If a user explicitly asks you to build, recommend, or suggest a multi-course schedule (e.g. "suggest a 3-course schedule"), you MUST output a schedule block containing a comma-separated list of COURSE CODES (not CRNs) for the courses in your proposed schedule.
Use this EXACT format — it MUST appear at the top level of your response, NOT inside a markdown code block or any other formatting:

[SCHEDULE_BLOCK]
ECS 150, ECS 036C, ECS 036A
[/SCHEDULE_BLOCK]

Rules for schedule blocks:
- ALWAYS use course codes (e.g. "ECS 150"), NOT CRNs.
- You MUST include the [SCHEDULE_BLOCK] and [/SCHEDULE_BLOCK] tags exactly as shown. Do not omit them.
- Include the block AFTER your text explanation of the schedule.
- Only suggest courses you are confident exist.
- Only recommend classes that appear in ${CURRENT_TERM_LABEL} section data.

DATA TOOLS & PROACTIVE RESEARCH:
You have access to powerful tools to fetch real-time course data. Use them proactively to ensure your advice is accurate:
1. getCourseDetails: Use this when you need deeper catalog details (prereqs, full descriptions, GE areas) for specific courses mentioned.
2. getSections: Use this to see if a course has sections in ${CURRENT_TERM_LABEL}, finding CRNs, instructors, and meeting times (days/time).
3. getGrades: Use this to find historical GPA and grade distributions (A-F) to help students judge course difficulty or compare professors.
4. searchCourses: Use this to discover courses by keyword (e.g. "renewable energy") or GE area (e.g. "AH") when students need recommendations.

If a student's query is vague or mentions a course you don't have full info for (e.g. "What are some good times for ECN 1A?"), USE THE TOOLS FIRST to find the ECN 001A sections before responding. Do not guess or say you don't have the data if a tool can provide it.
`);

  const advisingGoalIds = studentContext?.advisingGoals?.length
    ? studentContext.advisingGoals
    : studentContext?.advisingGoal
      ? [studentContext.advisingGoal]
      : [];
  const advisingGoals = getAdvisingGoals(advisingGoalIds);
  if (
    studentContext &&
    (studentContext.major ||
      studentContext.year ||
      studentContext.targetMajor ||
      studentContext.secondaryMajor ||
      studentContext.minors?.length ||
      studentContext.completedCourses?.length > 0 ||
      advisingGoals.length > 0)
  ) {
    const contextParts: string[] = ["Current student profile:"];
    const academicPlan = getAcademicPlan(studentContext);
    const academicPlanLabel =
      ACADEMIC_PLANS.find((plan) => plan.id === academicPlan)?.label ||
      academicPlan;
    contextParts.push(`- Academic plan: ${academicPlanLabel}`);
    if (advisingGoals.length > 0) {
      contextParts.push(`- Advising goals: ${advisingGoals.map((goal) => goal.label).join(", ")}`);
    }
    if (studentContext.major) {
      contextParts.push(`- Current major: ${studentContext.major}`);
    }
    if (studentContext.targetMajor) {
      contextParts.push(`- Goal major: ${studentContext.targetMajor}`);
    }
    if (studentContext.secondaryMajor) {
      contextParts.push(`- Second major: ${studentContext.secondaryMajor}`);
    }
    if (studentContext.minors?.length) {
      contextParts.push(`- Minor(s): ${studentContext.minors.join(", ")}`);
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

  if (sectionSnippets.length > 0) {
    parts.push(
      `Live schedule information for ${CURRENT_TERM_LABEL} (sections, times, instructors, and open seats):\n\n` +
        sectionSnippets
          .map((s, i) => `[Section ${i + 1}] ${s}`)
          .join("\n\n")
    );
  }

  if (gradeSnippets.length > 0) {
    parts.push(
      "Historical grade distribution data from CattleLog:\n\n" +
        gradeSnippets.map((g, i) => `[Grades ${i + 1}] ${g}`).join("\n\n")
    );
  }

  if (ragChunks.length > 0) {
    parts.push(
      "Reference material from the course catalog and degree requirements:\n\n" +
        ragChunks.map((chunk, i) => `[${i + 1}] ${chunk}`).join("\n\n")
    );
  }

  return parts.join("\n\n");
}
