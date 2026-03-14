import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

let cachedGrades: Record<string, any> | null = null;
let cachedCourses: Record<string, any> | null = null;

function loadGrades() {
  if (!cachedGrades) {
    try {
      const raw = fs.readFileSync(path.join(process.cwd(), "data", "grades.json"), "utf-8");
      cachedGrades = JSON.parse(raw);
    } catch {
      cachedGrades = {};
    }
  }
  return cachedGrades!;
}

function loadCourseInfo() {
  if (!cachedCourses) {
    try {
      const raw = fs.readFileSync(path.join(process.cwd(), "data", "courses-full.json"), "utf-8");
      const arr = JSON.parse(raw);
      cachedCourses = {};
      for (const c of arr) {
        cachedCourses[c.code] = c;
      }
    } catch {
      cachedCourses = {};
    }
  }
  return cachedCourses!;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const courseCode = url.searchParams.get("course")?.trim() || "";

  if (!courseCode) {
    return NextResponse.json({ error: "Missing course parameter" }, { status: 400 });
  }

  const grades = loadGrades();
  const courses = loadCourseInfo();

  const gradeData = grades[courseCode] || null;
  const courseInfo = courses[courseCode] || null;

  return NextResponse.json({
    courseCode,
    grades: gradeData,
    course: courseInfo,
  });
}
