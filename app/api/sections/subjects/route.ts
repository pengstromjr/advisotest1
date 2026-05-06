import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import type { Section } from "@/lib/course-data";
import { CURRENT_SECTIONS_FILE } from "@/lib/current-term";

let cached: Section[] | null = null;

function getCachedSections(): Section[] {
  if (cached) return cached;
  const sectionsPath = path.join(
    process.cwd(),
    "data",
    "sections",
    CURRENT_SECTIONS_FILE
  );
  try {
    const raw = fs.readFileSync(sectionsPath, "utf-8");
    cached = JSON.parse(raw) as Section[];
  } catch {
    cached = [];
  }
  return cached!;
}

export async function GET() {
  const sections = getCachedSections();
  const subjectSet = new Set<string>();
  for (const s of sections) {
    if (s.subject?.trim()) subjectSet.add(s.subject.trim().toUpperCase());
  }
  const subjects = Array.from(subjectSet).sort((a, b) => a.localeCompare(b));
  return NextResponse.json({ subjects });
}
