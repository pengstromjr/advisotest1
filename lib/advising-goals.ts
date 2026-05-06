export const ADVISING_GOALS = [
  {
    id: "stay-on-track",
    label: "Stay on track for my degree",
    description: "Check requirements and plan next steps.",
  },
  {
    id: "change-major",
    label: "Change my major",
    description: "See what classes, GPA, and requirements I need.",
  },
  {
    id: "optimize-schedule",
    label: "Optimize my schedule",
    description: "Build the best schedule around my time, workload, and preferences.",
  },
  {
    id: "interest-classes",
    label: "Find classes based on my interests",
    description: "Discover courses that match what I like.",
  },
  {
    id: "explore-classes",
    label: "Explore cool new classes",
    description: "Find hidden gems, fun electives, and popular courses.",
  },
  {
    id: "boost-gpa",
    label: "Boost my GPA",
    description: "Find manageable courses and balance my workload.",
  },
  {
    id: "minor-double-major",
    label: "Add a minor or double major",
    description: "See what is realistic with my current progress.",
  },
  {
    id: "graduation-plan",
    label: "Plan for graduation",
    description: "Map out future quarters and avoid missing requirements.",
  },
] as const;

export type AdvisingGoalId = (typeof ADVISING_GOALS)[number]["id"];

export const DEFAULT_ADVISING_GOAL_ID: AdvisingGoalId = "change-major";

export function getAdvisingGoal(goalId?: string | null) {
  return ADVISING_GOALS.find((goal) => goal.id === goalId);
}

export function getAdvisingGoals(goalIds?: readonly string[] | null) {
  if (!goalIds?.length) return [];
  const selected = new Set(goalIds);
  return ADVISING_GOALS.filter((goal) => selected.has(goal.id));
}
