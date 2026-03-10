import { getAllPrograms, getAllCourseCodes } from "@/lib/course-lookup";
import { NextResponse } from "next/server";

let cached: { programs: string[]; courses: string[] } | null = null;

export async function GET() {
  if (!cached) {
    const [programs, courses] = await Promise.all([
      getAllPrograms(),
      getAllCourseCodes(),
    ]);
    cached = { programs: programs.sort(), courses: courses.sort() };
  }
  return NextResponse.json(cached);
}
