"use client";

import Markdown from "react-markdown";
import { CourseCard } from "./course-card";
import { SuggestedScheduleCard } from "./suggested-schedule-card";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  completedCourses?: string[];
}

interface CourseCardData {
  courseCode: string;
  title: string;
  units: string;
  description?: string;
  geAreas?: string[];
  days?: string;
  time?: string;
  instructor?: string;
  crn?: string;
  seats?: string;
}

interface ScheduleBlockData {
  courseCodes: string[];
}

const CARD_RE =
  /\[COURSE_CARD\]([\s\S]*?)\[\/COURSE_CARD\]/g;
const SCHEDULE_BLOCK_RE =
  /\[SCHEDULE_BLOCK\]([\s\S]*?)\[\/SCHEDULE_BLOCK\]/g;

function parseCardBlock(block: string): CourseCardData | null {
  const get = (key: string): string | undefined => {
    const re = new RegExp(`^${key}:\\s*(.+)$`, "mi");
    const m = block.match(re);
    return m?.[1]?.trim() || undefined;
  };

  const courseCode = get("course_code") || get("code");
  const title = get("title");
  if (!courseCode || !title) return null;

  const geRaw = get("ge_areas") || get("ge");
  const geAreas = geRaw
    ? geRaw.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)
    : undefined;

  return {
    courseCode,
    title,
    units: get("units") || "4",
    description: get("description"),
    geAreas,
    days: get("days"),
    time: get("time"),
    instructor: get("instructor"),
    crn: get("crn"),
    seats: get("seats"),
  };
}

/**
 * Detect if a message looks like a schedule suggestion and extract course codes.
 * This works even when the AI doesn't use [SCHEDULE_BLOCK] tags.
 */
function detectScheduleResponse(text: string): string[] | null {
  // Check if this looks like a schedule suggestion
  const scheduleKeywords = /schedul|recommend.*cours|suggest.*cours|here.*course|course.*plan/i;
  if (!scheduleKeywords.test(text)) return null;

  // Extract all course codes (e.g., "ECS 150", "MAT 021A", "PHI 001")
  const courseCodeRegex = /\b([A-Z]{2,5})\s+(\d{3}[A-Z]?\d?(?:\/[A-Z]\d*)?)\b/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = courseCodeRegex.exec(text)) !== null) {
    const code = `${m[1]} ${m[2]}`;
    // Filter out things that look like course codes but aren't (e.g., "GE areas")
    if (m[1] !== "GE" && m[1] !== "UC" && m[1] !== "CRN") {
      found.add(code);
    }
  }

  // Only treat as a schedule if we found 2+ unique course codes
  if (found.size >= 2) {
    return Array.from(found);
  }
  return null;
}

function splitContent(text: string): (string | CourseCardData | ScheduleBlockData)[] {
  const parts: (string | CourseCardData | ScheduleBlockData)[] = [];
  let lastIndex = 0;
  let hasExplicitBlock = false;

  // Combine both regexes into one to find the earliest match
  const combinedRegex = new RegExp(
    `(?:${CARD_RE.source})|(?:${SCHEDULE_BLOCK_RE.source})`,
    "g"
  );
  let match: RegExpExecArray | null;

  while ((match = combinedRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    if (match[1] !== undefined) {
      // It's a COURSE_CARD
      const card = parseCardBlock(match[1]);
      if (card) {
        parts.push(card);
      } else {
        parts.push(match[0]);
      }
    } else if (match[2] !== undefined) {
      // It's a SCHEDULE_BLOCK
      hasExplicitBlock = true;
      const courseCodes = match[2]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (courseCodes.length > 0) {
        parts.push({ courseCodes });
      } else {
        parts.push(match[0]);
      }
    } else {
      parts.push(match[0]);
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  // If no explicit SCHEDULE_BLOCK was found and no COURSE_CARDs,
  // try auto-detecting course codes from the plain text
  const hasNonStringParts = parts.some((p) => typeof p !== "string");
  if (!hasExplicitBlock && !hasNonStringParts) {
    const detectedCodes = detectScheduleResponse(text);
    if (detectedCodes && detectedCodes.length >= 2) {
      // Append the schedule card at the end
      parts.push({ courseCodes: detectedCodes } as ScheduleBlockData);
    }
  }

  return parts;
}

export function MessageBubble({
  role,
  content,
  completedCourses,
}: MessageBubbleProps) {
  const isUser = role === "user";

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-[#002855] px-4 py-3 text-sm leading-relaxed text-white">
          <p className="whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    );
  }

  const parts = splitContent(content);
  const hasCards = parts.some((p) => typeof p !== "string");

  if (!hasCards) {
    return (
      <div className="flex justify-start">
        <div className="max-w-[80%] rounded-2xl rounded-bl-md bg-gray-100 dark:bg-slate-800 px-4 py-3 text-sm leading-relaxed text-gray-900 dark:text-slate-100">
          <div className="prose prose-sm prose-gray dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
            <Markdown>{content}</Markdown>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] space-y-2">
        {parts.map((part, i) =>
          typeof part === "string" ? (
            part.trim() ? (
              <div
                key={i}
                className="rounded-2xl rounded-bl-md bg-gray-100 dark:bg-slate-800 px-4 py-3 text-sm leading-relaxed text-gray-900 dark:text-slate-100"
              >
                <div className="prose prose-sm prose-gray dark:prose-invert max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1 [&_li]:my-0.5">
                  <Markdown>{part}</Markdown>
                </div>
              </div>
            ) : null
          ) : "courseCodes" in part ? (
            <SuggestedScheduleCard key={`block-${i}`} courseCodes={part.courseCodes} />
          ) : (
            <CourseCard
              key={`card-${i}`}
              {...part}
              completedCourses={completedCourses}
            />
          )
        )}
      </div>
    </div>
  );
}
