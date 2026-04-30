import { NextResponse } from "next/server";
import { extractCourseMentions } from "@/lib/course-lookup";

const MAX_TRANSCRIPT_CHARS = 50_000;

function transcriptJson(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return NextResponse.json(body, { ...init, headers });
}

export async function POST(req: Request) {
  try {
    const { transcript } = (await req.json()) as {
      transcript?: string;
    };

    if (!transcript || typeof transcript !== "string") {
      return transcriptJson(
        { error: "Missing 'transcript' text" },
        { status: 400 }
      );
    }

    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      return transcriptJson(
        {
          error:
            "Transcript text is too long. Paste only the completed-course section or add courses manually.",
        },
        { status: 413 }
      );
    }

    const courses = await extractCourseMentions(transcript);
    const codes = Array.from(new Set(courses.map((c) => c.code))).sort();

    return transcriptJson({
      count: codes.length,
      codes,
      privacy:
        "Transcript text is parsed for course codes only and is not returned or cached by this endpoint.",
    });
  } catch {
    return transcriptJson(
      { error: "Failed to parse transcript" },
      { status: 500 }
    );
  }
}

