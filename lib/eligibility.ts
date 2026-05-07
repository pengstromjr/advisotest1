/**
 * Shared prerequisite checking logic.
 */

import { extractCourseCodeMatches, normalizeCourseCode } from "./course-code";

export interface CourseMinimal {
  ge_areas: string[];
  units: number | string;
  prerequisites: string;
}

/**
 * Checks if a student is eligible for a course based on its prerequisites string.
 */
export function isEligible(
  courseCode: string,
  completed: string[],
  infoMap: Record<string, CourseMinimal>,
  studentYear: string
) {
  const normalizedCourseCode = normalizeCourseCode(courseCode);
  const info = infoMap[courseCode] || infoMap[normalizedCourseCode];
  // If we don't have info, we can't be sure, so assume eligible but log it
  if (!info) return true;
  if (!info.prerequisites) return true;

  const completedSet = new Set(completed.map(normalizeCourseCode));
  const prereqText = info.prerequisites.toUpperCase();
  const groups = prereqText.split(";").map((g: string) => g.trim());

  for (const group of groups) {
    // 1. Check for "Upper Division Standing"
    if (group.includes("UPPER DIVISION STANDING")) {
      const isUD = ["JUNIOR", "SENIOR"].includes(studentYear.toUpperCase());
      if (!isUD) return false;
    }

    const codesInGroup = extractCourseCodeMatches(group).map((match) => match.code);

    if (codesInGroup.length === 0) continue;

    // Only treat as OR group if there are actually multiple codes OR specific OR keywords
    const hasOrKeywords = group.includes(" OR ") || group.includes(" / ");
    const isOrGroup = hasOrKeywords && codesInGroup.length > 1;

    if (isOrGroup) {
      if (!codesInGroup.some((code) => completedSet.has(code))) return false;
    } else {
      if (!codesInGroup.every((code) => completedSet.has(code))) return false;
    }
  }
  return true;
}
