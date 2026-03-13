import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

interface CatalogCourse {
  code: string;
  title: string;
  units: number | string;
  description: string;
  prerequisites: string | string[];
  ge_areas: string[];
  department: string;
}

let cached: CatalogCourse[] | null = null;

function loadCourses(): CatalogCourse[] {
  if (cached) return cached;
  try {
    const raw = fs.readFileSync(
      path.join(process.cwd(), "data", "courses.json"),
      "utf-8"
    );
    cached = JSON.parse(raw) as CatalogCourse[];
  } catch {
    cached = [];
  }
  return cached!;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const codes = url.searchParams.get("codes");

  if (!codes) {
    return NextResponse.json({ courses: [] });
  }

  const requestedCodes = codes
    .split(",")
    .map((c) => c.trim().toUpperCase())
    .filter(Boolean);

  const allCourses = loadCourses();
  const found: CatalogCourse[] = [];

  for (const code of requestedCodes) {
    const course = allCourses.find((c) => c.code.toUpperCase() === code);
    if (course) {
      found.push(course);
    }
  }

  return NextResponse.json({ courses: found });
}
