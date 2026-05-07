export interface CourseCodeMatch {
  code: string;
  subject: string;
  number: string;
  suffix: string;
  raw: string;
  index: number;
}

const COURSE_CODE_PARTS_RE = /^([A-Z]{2,12})\s*(\d{1,3})(?:\s*([A-Z]{1,2}))?$/;
const COURSE_CODE_TEXT_RE =
  /\b([A-Z]{2,5})\s*(\d{1,3})\s+([A-Z])\b|\b([A-Z]{2,12})\s*(\d{1,3})([A-Z]{0,2})\b/gi;

export function normalizeCourseCode(code: string): string {
  const normalized = code
    .toUpperCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(COURSE_CODE_PARTS_RE);
  if (!match) return normalized;

  const [, subject, number, suffix = ""] = match;
  const paddedNumber = number.length <= 2 ? number.padStart(3, "0") : number;
  return `${subject} ${paddedNumber}${suffix}`;
}

export function parseCourseCodeParts(code: string): CourseCodeMatch | null {
  const normalized = code
    .toUpperCase()
    .replace(/[._-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const match = normalized.match(COURSE_CODE_PARTS_RE);
  if (!match) return null;

  const [, subject, number, suffix = ""] = match;
  return {
    code: normalizeCourseCode(`${subject} ${number}${suffix}`),
    subject,
    number,
    suffix,
    raw: code,
    index: 0,
  };
}

export function extractCourseCodeMatches(text: string): CourseCodeMatch[] {
  const matches: CourseCodeMatch[] = [];
  const regex = new RegExp(COURSE_CODE_TEXT_RE.source, "gi");
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const subject = (match[1] || match[4] || "").toUpperCase();
    const number = match[2] || match[5] || "";
    const suffix = (match[3] || match[6] || "").toUpperCase();
    if (!subject || !number) continue;

    matches.push({
      code: normalizeCourseCode(`${subject} ${number}${suffix}`),
      subject,
      number,
      suffix,
      raw: match[0],
      index: match.index,
    });
  }

  return matches;
}
