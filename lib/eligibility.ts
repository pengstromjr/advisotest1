/**
 * Shared prerequisite checking logic.
 */

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
  const info = infoMap[courseCode];
  // If we don't have info, we can't be sure, so assume eligible but log it
  if (!info) return true;
  if (!info.prerequisites) return true;

  const prereqText = info.prerequisites.toUpperCase();
  const groups = prereqText.split(";").map((g: string) => g.trim());
  const COURSE_CODE_RE = /\b([A-Z]{2,12})\s*(\d{1,3}[A-Z]?)\b/g;

  for (const group of groups) {
    // 1. Check for "Upper Division Standing"
    if (group.includes("UPPER DIVISION STANDING")) {
      const isUD = ["JUNIOR", "SENIOR"].includes(studentYear.toUpperCase());
      if (!isUD) return false;
    }

    const codesInGroup: string[] = [];
    let m;
    COURSE_CODE_RE.lastIndex = 0; // Reset just in case
    while ((m = COURSE_CODE_RE.exec(group)) !== null) {
      codesInGroup.push(`${m[1]} ${m[2]}`);
    }

    if (codesInGroup.length === 0) continue;

    // Only treat as OR group if there are actually multiple codes OR specific OR keywords
    const hasOrKeywords = group.includes(" OR ") || group.includes(" / ");
    const isOrGroup = hasOrKeywords && codesInGroup.length > 1;

    if (isOrGroup) {
      if (!codesInGroup.some((code) => completed.includes(code))) return false;
    } else {
      if (!codesInGroup.every((code) => completed.includes(code))) return false;
    }
  }
  return true;
}
