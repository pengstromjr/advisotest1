#!/usr/bin/env node
/**
 * CattleLog Grade Distribution Scraper
 *
 * Fetches historical UC Davis grade distributions from CattleLog for every
 * unique course in a sections file. Output keeps the legacy `data/grades.json`
 * shape used by Adviso, and adds raw course/professor quarter metadata.
 *
 * Examples:
 *   node scripts/scrape-grades.mjs
 *   node scripts/scrape-grades.mjs --sections=fall-2026.json --out=fall-2026-grades.json
 *   node scripts/scrape-grades.mjs --refresh-cache --delay-ms=900
 */

import fs from "fs";
import path from "path";

const API_BASE = "https://api.daviscattlelog.com/api/courses";
const DEFAULT_DELAY_MS = 600;
const DEFAULT_BATCH_SIZE = 5;
const DEFAULT_SECTIONS_FILE = "fall-2026.json";
const DEFAULT_OUT_FILE = "fall-2026-grades.json";

const args = process.argv.slice(2);
const refreshCache = args.includes("--refresh-cache");
const mergeExisting = args.includes("--merge-existing");
const dryRun = args.includes("--dry-run");
const sectionsArg = args.find((arg) => arg.startsWith("--sections="));
const outArg = args.find((arg) => arg.startsWith("--out="));
const limitArg = args.find((arg) => arg.startsWith("--limit="));
const delayArg = args.find((arg) => arg.startsWith("--delay-ms="));
const batchArg = args.find((arg) => arg.startsWith("--batch-size="));

const sectionsFile = sectionsArg
  ? sectionsArg.slice("--sections=".length)
  : DEFAULT_SECTIONS_FILE;
const outFile = outArg ? outArg.slice("--out=".length) : DEFAULT_OUT_FILE;
const limit = limitArg ? Number.parseInt(limitArg.slice("--limit=".length), 10) : null;
const delayMs = delayArg
  ? Number.parseInt(delayArg.slice("--delay-ms=".length), 10)
  : DEFAULT_DELAY_MS;
const batchSize = batchArg
  ? Number.parseInt(batchArg.slice("--batch-size=".length), 10)
  : DEFAULT_BATCH_SIZE;

const sectionsPath = path.join(process.cwd(), "data", "sections", sectionsFile);
const outPath = path.join(process.cwd(), "data", outFile);
const summaryPath = path.join(
  process.cwd(),
  "data",
  outFile.replace(/\.json$/i, "-summary.json")
);
const cacheDir = path.join(process.cwd(), "data", "cattlelog", ".cache", "courses");

function readJson(filePath, fallback) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Convert Adviso course code to CattleLog's API id:
 *   "ECS 036A" -> "ECS36A"
 *   "MAT 021A" -> "MAT21A"
 *   "CHE 002A" -> "CHE2A"
 */
function toCattleLogId(courseCode) {
  const normalized = courseCode.toUpperCase().replace(/\s+/g, " ").trim();
  const match = normalized.match(/^([A-Z]+)\s*(\d+)([A-Z]*)$/);
  if (!match) return normalized.replace(/\s+/g, "");
  const [, subject, number, suffix] = match;
  return `${subject}${number.replace(/^0+/, "") || "0"}${suffix}`;
}

function gradeCount(distribution, grades) {
  return grades.reduce((sum, grade) => sum + (distribution?.[grade] || 0), 0);
}

function summarizeDistribution(distribution) {
  const total = Object.values(distribution || {}).reduce((sum, value) => sum + value, 0);
  if (!total) {
    return {
      total: 0,
      aRangePercent: 0,
      bRangePercent: 0,
      cRangePercent: 0,
      dRangePercent: 0,
      fPercent: 0,
      passNoPassPercent: 0,
    };
  }

  const pct = (count) => Math.round((count / total) * 1000) / 10;
  return {
    total,
    aRangePercent: pct(gradeCount(distribution, ["A+", "A", "A-"])),
    bRangePercent: pct(gradeCount(distribution, ["B+", "B", "B-"])),
    cRangePercent: pct(gradeCount(distribution, ["C+", "C", "C-"])),
    dRangePercent: pct(gradeCount(distribution, ["D+", "D", "D-"])),
    fPercent: pct(gradeCount(distribution, ["F"])),
    passNoPassPercent: pct(gradeCount(distribution, ["P*", "NP*"])),
  };
}

function normalizeProfessor(professor) {
  const quarterData = professor.professor_quarter_data || {};
  const total = quarterData.Total || {};
  const quarters = Object.fromEntries(
    Object.entries(quarterData)
      .filter(([quarter]) => quarter !== "Total")
      .map(([quarter, data]) => [
        quarter,
        {
          gpa: data.quarter_average_gpa ?? null,
          enrolled: data.quarter_enrolled ?? null,
          grades: data.quarter_grade_distribution || {},
          summary: summarizeDistribution(data.quarter_grade_distribution || {}),
        },
      ])
  );

  return {
    name: professor.professor_name,
    slug: professor.professor_slug,
    totalGpa: total.quarter_average_gpa ?? null,
    totalEnrolled: total.quarter_enrolled ?? null,
    totalGrades: total.quarter_grade_distribution || {},
    totalSummary: summarizeDistribution(total.quarter_grade_distribution || {}),
    quarters,
  };
}

function normalizeCourseGrade(courseCode, cattleLogId, data, lastSyncedAt) {
  return {
    source: "CattleLog",
    lastSyncedAt,
    course_id: data.course_id || cattleLogId,
    course_title: data.course_title || "",
    cattlelogId: cattleLogId,
    overall_gpa: data.overall_gpa,
    overall_grades: data.overall_grades || {},
    overall_grade_summary: summarizeDistribution(data.overall_grades || {}),
    overall_enrolled: data.overall_enrolled,
    available_quarters: data.available_quarters || [],
    professors: (data.professors || []).map(normalizeProfessor),
    courseCode,
  };
}

async function fetchCattleLog(courseCode) {
  const cattleLogId = toCattleLogId(courseCode);
  const cachePath = path.join(cacheDir, `${cattleLogId}.json`);

  if (!refreshCache) {
    const cached = readJson(cachePath, null);
    if (cached) return { data: cached, cattleLogId, fromCache: true };
  }

  const url = `${API_BASE}/${cattleLogId}/grades`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    },
  });

  if (res.status === 404) return { data: null, cattleLogId, fromCache: false };
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} from CattleLog for ${courseCode}`);
  }

  const data = await res.json();
  writeJson(cachePath, data);
  return { data, cattleLogId, fromCache: false };
}

const sections = readJson(sectionsPath, []);
const courseCodes = [...new Set(sections.map((section) => section.courseCode).filter(Boolean))]
  .sort((a, b) => a.localeCompare(b))
  .slice(0, limit ?? undefined);

const existingOutput = mergeExisting ? readJson(outPath, {}) : {};
const grades = { ...existingOutput };
const toFetch = courseCodes.filter((courseCode) => refreshCache || !grades[courseCode]);

console.log(`CattleLog grade scrape for ${sectionsFile}`);
console.log(`Unique courses in sections: ${courseCodes.length}`);
console.log(`Already in output: ${Object.keys(existingOutput).length}`);
console.log(`Need to fetch: ${toFetch.length}`);
console.log(`Output: ${outPath}${dryRun ? " (dry run)" : ""}\n`);

let found = 0;
let notFound = 0;
let failed = 0;
let fromCache = 0;
const failedCourses = [];
const missingCourses = [];
const lastSyncedAt = new Date().toISOString();

for (let i = 0; i < toFetch.length; i += batchSize) {
  const batch = toFetch.slice(i, i + batchSize);

  await Promise.all(
    batch.map(async (courseCode) => {
      try {
        const result = await fetchCattleLog(courseCode);
        if (result.fromCache) fromCache += 1;

        if (!result.data || result.data.overall_gpa === undefined) {
          notFound += 1;
          missingCourses.push(courseCode);
          return;
        }

        grades[courseCode] = normalizeCourseGrade(
          courseCode,
          result.cattleLogId,
          result.data,
          lastSyncedAt
        );
        found += 1;
        console.log(
          `  ✓ ${courseCode} -> GPA ${result.data.overall_gpa}, ${result.data.overall_enrolled} students${
            result.fromCache ? " (cache)" : ""
          }`
        );
      } catch (error) {
        failed += 1;
        failedCourses.push({
          courseCode,
          error: error instanceof Error ? error.message : String(error),
        });
        console.error(
          `  ✗ ${courseCode}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    })
  );

  if (!dryRun && ((i > 0 && i % 50 === 0) || i + batchSize >= toFetch.length)) {
    writeJson(outPath, Object.fromEntries(Object.entries(grades).sort()));
  }

  console.log(
    `  Progress: ${Math.min(i + batchSize, toFetch.length)}/${toFetch.length} | Found: ${found} | Not found: ${notFound} | Failed: ${failed}`
  );

  if (delayMs > 0 && i + batchSize < toFetch.length) {
    await sleep(delayMs);
  }
}

const sortedGrades = Object.fromEntries(Object.entries(grades).sort());
const summary = {
  source: "CattleLog",
  sectionsFile,
  outputPath: outPath,
  lastSyncedAt,
  uniqueCoursesInSections: courseCodes.length,
  outputCourses: Object.keys(sortedGrades).length,
  fetchedThisRun: toFetch.length,
  foundThisRun: found,
  fromCacheThisRun: fromCache,
  notFoundThisRun: notFound,
  failedThisRun: failed,
  missingCourses,
  failedCourses,
};

if (!dryRun) {
  writeJson(outPath, sortedGrades);
  writeJson(summaryPath, summary);
}

console.log("\n=== DONE ===");
console.log(`Courses with CattleLog grades in output: ${Object.keys(sortedGrades).length}`);
console.log(`Found this run: ${found}`);
console.log(`From cache this run: ${fromCache}`);
console.log(`Courses not in CattleLog: ${notFound}`);
console.log(`Failed: ${failed}`);
console.log(`Saved to ${outPath}`);
