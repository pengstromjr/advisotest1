import { NextResponse } from "next/server";
import { extractCourseMentions } from "@/lib/course-lookup";

export async function POST(req: Request) {
  try {
    const { transcript } = (await req.json()) as {
      transcript?: string;
    };

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json(
        { error: "Missing 'transcript' text" },
        { status: 400 }
      );
    }

    const courses = await extractCourseMentions(transcript);
    const codes = Array.from(new Set(courses.map((c) => c.code))).sort();

    return NextResponse.json({
      count: codes.length,
      codes,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to parse transcript" },
      { status: 500 }
    );
  }
}

