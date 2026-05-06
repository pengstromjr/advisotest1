import type { StudentContext } from "./course-data";

export type AcademicPlanId =
  | "single-major"
  | "double-major"
  | "major-minor"
  | "double-major-minor";

export const ACADEMIC_PLANS: {
  id: AcademicPlanId;
  label: string;
  description: string;
}[] = [
  {
    id: "single-major",
    label: "Single major",
    description: "Track one primary degree program.",
  },
  {
    id: "double-major",
    label: "Double major",
    description: "Track two majors side by side.",
  },
  {
    id: "major-minor",
    label: "Major + minor",
    description: "Track a major plus one or more minors.",
  },
  {
    id: "double-major-minor",
    label: "Double major + minor",
    description: "Track two majors plus one or more minors.",
  },
];

export function getAcademicPlan(context: StudentContext): AcademicPlanId {
  return context.academicPlan || "single-major";
}

export function planIncludesSecondMajor(plan: AcademicPlanId) {
  return plan === "double-major" || plan === "double-major-minor";
}

export function planIncludesMinor(plan: AcademicPlanId) {
  return plan === "major-minor" || plan === "double-major-minor";
}

export function formatProgramName(program: string): string {
  return program.replace(/,\s*(Bachelor|Master|Doctor).+$/i, "").trim();
}

export function selectedAuditPrograms(context: StudentContext) {
  const plan = getAcademicPlan(context);
  const programs: { id: string; label: string; value: string; kind: "major" | "minor" }[] = [];

  if (context.major) {
    programs.push({
      id: "primary-major",
      label: "Primary major",
      value: context.major,
      kind: "major",
    });
  }

  if (planIncludesSecondMajor(plan) && context.secondaryMajor) {
    programs.push({
      id: "secondary-major",
      label: "Second major",
      value: context.secondaryMajor,
      kind: "major",
    });
  }

  if (planIncludesMinor(plan)) {
    for (const minor of context.minors || []) {
      programs.push({
        id: `minor-${minor}`,
        label: "Minor",
        value: minor,
        kind: "minor",
      });
    }
  }

  return programs;
}
