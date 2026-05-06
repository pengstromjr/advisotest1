import fs from "fs/promises";
import path from "path";
import type { Section } from "@/lib/course-data";

type RmpTeacher = {
  id: string;
  legacyId: number;
  firstName: string;
  lastName: string;
  department: string;
  avgRating: number;
  numRatings: number;
  wouldTakeAgainPercent: number | null;
  avgDifficulty: number;
  school?: {
    id: string;
    name: string;
  };
};

type InstructorCourseRef = {
  subject: string;
  courseNumber: string;
  courseCode: string;
  title: string;
  sectionCount: number;
};

type RmpInstructorRecord = {
  source: "Rate My Professors";
  schoolId: "1073";
  schoolName: "University of California Davis";
  lastSyncedAt: string;
  instructorName: string;
  searchText: string;
  parsedName: {
    lastName?: string;
    firstNameOrInitial?: string;
  };
  sectionCount: number;
  courseRefs: InstructorCourseRef[];
  match:
    | {
        id: string;
        legacyId: number;
        firstName: string;
        lastName: string;
        fullName: string;
        department: string;
        avgRating: number;
        numRatings: number;
        wouldTakeAgainPercent: number | null;
        avgDifficulty: number;
        profileUrl: string;
        matchScore: number;
        matchReason: string;
      }
    | null;
  candidates: Array<{
    legacyId: number;
    firstName: string;
    lastName: string;
    fullName: string;
    department: string;
    avgRating: number;
    numRatings: number;
    profileUrl: string;
    matchScore: number;
    matchReason: string;
  }>;
};

const SCHOOL_LEGACY_ID = "1073";
const SCHOOL_GRAPHQL_ID = "U2Nob29sLTEwNzM=";
const SCHOOL_NAME = "University of California Davis";
const GRAPHQL_URL = "https://www.ratemyprofessors.com/graphql";
const SECTIONS_PATH = path.join(process.cwd(), "data", "sections", "fall-2026.json");
const OUT_DIR = path.join(process.cwd(), "data", "ratemyprofessors");
const OUT_PATH = path.join(OUT_DIR, "ucdavis-fall-2026-instructors.json");
const HIGH_CONFIDENCE_OUT_PATH = path.join(
  OUT_DIR,
  "ucdavis-fall-2026-high-confidence.json"
);
const SUMMARY_PATH = path.join(OUT_DIR, "ucdavis-fall-2026-summary.json");
const CACHE_DIR = path.join(OUT_DIR, ".cache", "ucdavis-search");
const DEFAULT_DELAY_MS = 650;
const MAX_CANDIDATES = 5;
const APP_CONFIDENCE_THRESHOLD = 0.9;

const args = new Set(process.argv.slice(2));
const dryRun = args.has("--dry-run");
const forceRefresh = args.has("--refresh-cache");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
const onlyArg = process.argv.find((arg) => arg.startsWith("--instructor="));
const limit = limitArg ? Number.parseInt(limitArg.slice("--limit=".length), 10) : null;
const delayMs = delayArg
  ? Number.parseInt(delayArg.slice("--delay-ms=".length), 10)
  : DEFAULT_DELAY_MS;
const onlyInstructor = onlyArg ? onlyArg.slice("--instructor=".length).trim() : null;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeText(value: string | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cleanInstructorName(value: string): string {
  return value.replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ").trim();
}

function expandInstructorNames(value: string): string[] {
  const clean = cleanInstructorName(value);
  const commaParts = clean
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);

  const hasInitialPart = commaParts.some((part) => /^[A-Z]\.?$/i.test(part));
  if (commaParts.length > 1 && !hasInitialPart && commaParts.every((part) => part.length > 1)) {
    return commaParts;
  }

  return [clean];
}

function parseInstructorName(name: string): {
  lastName?: string;
  firstNameOrInitial?: string;
  searchText: string;
} {
  const clean = cleanInstructorName(name);
  if (!clean || /staff/i.test(clean)) {
    return { searchText: clean };
  }

  if (clean.includes(",")) {
    const [lastName, ...firstParts] = clean.split(",").map((part) => part.trim());
    const firstNameOrInitial = firstParts.join(" ").trim();
    return {
      lastName,
      firstNameOrInitial: firstNameOrInitial || undefined,
      searchText: [firstNameOrInitial, lastName].filter(Boolean).join(" "),
    };
  }

  const parts = clean.split(" ");
  if (parts.length >= 2) {
    return {
      firstNameOrInitial: parts.slice(0, -1).join(" "),
      lastName: parts.at(-1),
      searchText: clean,
    };
  }

  return {
    lastName: clean,
    searchText: clean,
  };
}

function cacheKey(searchText: string): string {
  return `${normalizeText(searchText).replace(/\s+/g, "-") || "empty"}.json`;
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch {
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function buildCourseRefs(sections: Section[], instructorName: string): InstructorCourseRef[] {
  const refs = new Map<string, InstructorCourseRef>();

  for (const section of sections) {
    const expandedNames = (section.instructors ?? []).flatMap(expandInstructorNames);
    if (!expandedNames.includes(instructorName)) continue;
    const key = section.courseCode;
    const existing = refs.get(key);
    if (existing) {
      existing.sectionCount += 1;
      continue;
    }
    refs.set(key, {
      subject: section.subject,
      courseNumber: section.courseNumber,
      courseCode: section.courseCode,
      title: section.title,
      sectionCount: 1,
    });
  }

  return Array.from(refs.values()).sort((a, b) => a.courseCode.localeCompare(b.courseCode));
}

function scoreTeacherMatch(
  teacher: RmpTeacher,
  parsed: ReturnType<typeof parseInstructorName>
): { score: number; reason: string } {
  const parsedLast = normalizeText(parsed.lastName);
  const parsedFirst = normalizeText(parsed.firstNameOrInitial);
  const teacherLast = normalizeText(teacher.lastName);
  const teacherFirst = normalizeText(teacher.firstName);

  if (!parsedLast) return { score: 0, reason: "No parsed instructor last name" };

  const lastExact = parsedLast === teacherLast;
  const lastContains =
    teacherLast.includes(parsedLast) ||
    parsedLast.includes(teacherLast) ||
    teacherLast.split(" ").at(-1) === parsedLast.split(" ").at(-1);
  const firstExact = parsedFirst && parsedFirst === teacherFirst;
  const parsedFirstIsInitial = /^[a-z]$/.test(parsedFirst);
  const firstInitial =
    parsedFirst &&
    teacherFirst &&
    (parsedFirstIsInitial
      ? parsedFirst[0] === teacherFirst[0]
      : teacherFirst.startsWith(parsedFirst) || parsedFirst.startsWith(teacherFirst));

  if (lastExact && firstExact) {
    return { score: 0.99, reason: "Exact first and last name match" };
  }
  if (lastExact && firstInitial) {
    return { score: 0.92, reason: "Exact last name and first initial match" };
  }
  if (lastContains && firstExact) {
    return { score: 0.88, reason: "Close last name and exact first name match" };
  }
  if (lastContains && firstInitial) {
    return { score: 0.82, reason: "Close last name and first initial match" };
  }
  if (lastExact && !parsedFirst) {
    return { score: 0.68, reason: "Last-name-only match" };
  }
  if (lastContains && !parsedFirst) {
    return { score: 0.55, reason: "Close last-name-only match" };
  }

  return { score: 0, reason: "Name does not match" };
}

async function searchRateMyProfessors(searchText: string): Promise<RmpTeacher[]> {
  const cachePath = path.join(CACHE_DIR, cacheKey(searchText));
  if (!forceRefresh) {
    const cached = await readJsonFile<RmpTeacher[]>(cachePath);
    if (cached) return cached;
  }

  const body = JSON.stringify({
    query: `query NewSearchTeachersQuery($query: TeacherSearchQuery!) {
      newSearch {
        teachers(query: $query) {
          edges {
            node {
              id
              legacyId
              firstName
              lastName
              department
              avgRating
              numRatings
              wouldTakeAgainPercent
              avgDifficulty
              school { id name }
            }
          }
        }
      }
    }`,
    variables: {
      query: {
        text: searchText,
        schoolID: SCHOOL_GRAPHQL_ID,
        fallback: true,
      },
    },
  });

  const response = await fetch(GRAPHQL_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Referer: `https://www.ratemyprofessors.com/search/professors/${SCHOOL_LEGACY_ID}?q=${encodeURIComponent(
        searchText
      )}`,
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from Rate My Professors`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(payload.errors.map((error: { message: string }) => error.message).join("; "));
  }

  const teachers = ((payload.data?.newSearch?.teachers?.edges ?? []) as Array<{
    node: RmpTeacher;
  }>)
    .map(({ node }) => node)
    .filter((teacher) => teacher.school?.id === SCHOOL_GRAPHQL_ID);

  await writeJsonFile(cachePath, teachers);
  return teachers;
}

function buildRecord(
  instructorName: string,
  sections: Section[],
  teachers: RmpTeacher[],
  lastSyncedAt: string
): RmpInstructorRecord {
  const parsed = parseInstructorName(instructorName);
  const scored = teachers
    .map((teacher) => {
      const { score, reason } = scoreTeacherMatch(teacher, parsed);
      return { teacher, score, reason };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || b.teacher.numRatings - a.teacher.numRatings);

  const best = scored[0];
  const hasFirstNameSignal = Boolean(parsed.firstNameOrInitial);
  const hasUniqueLastNameOnlyMatch =
    !hasFirstNameSignal && scored.filter(({ score }) => score >= 0.68).length === 1;
  const match =
    best && best.score >= 0.68 && (hasFirstNameSignal || hasUniqueLastNameOnlyMatch)
      ? {
          id: best.teacher.id,
          legacyId: best.teacher.legacyId,
          firstName: best.teacher.firstName,
          lastName: best.teacher.lastName,
          fullName: `${best.teacher.firstName} ${best.teacher.lastName}`,
          department: best.teacher.department,
          avgRating: best.teacher.avgRating,
          numRatings: best.teacher.numRatings,
          wouldTakeAgainPercent: best.teacher.wouldTakeAgainPercent,
          avgDifficulty: best.teacher.avgDifficulty,
          profileUrl: `https://www.ratemyprofessors.com/professor/${best.teacher.legacyId}`,
          matchScore: best.score,
          matchReason: best.reason,
        }
      : null;

  return {
    source: "Rate My Professors",
    schoolId: SCHOOL_LEGACY_ID,
    schoolName: SCHOOL_NAME,
    lastSyncedAt,
    instructorName,
    searchText: parsed.searchText,
    parsedName: {
      lastName: parsed.lastName,
      firstNameOrInitial: parsed.firstNameOrInitial,
    },
    sectionCount: sections.filter((section) => section.instructors?.includes(instructorName))
      .length,
    courseRefs: buildCourseRefs(sections, instructorName),
    match,
    candidates: scored.slice(0, MAX_CANDIDATES).map(({ teacher, score, reason }) => ({
      legacyId: teacher.legacyId,
      firstName: teacher.firstName,
      lastName: teacher.lastName,
      fullName: `${teacher.firstName} ${teacher.lastName}`,
      department: teacher.department,
      avgRating: teacher.avgRating,
      numRatings: teacher.numRatings,
      profileUrl: `https://www.ratemyprofessors.com/professor/${teacher.legacyId}`,
      matchScore: score,
      matchReason: reason,
    })),
  };
}

async function loadExistingRecords(): Promise<Map<string, RmpInstructorRecord>> {
  const existing = await readJsonFile<RmpInstructorRecord[]>(OUT_PATH);
  return new Map((existing ?? []).map((record) => [record.instructorName, record]));
}

function buildHighConfidenceAppData(
  records: RmpInstructorRecord[]
): Record<string, {
  avgRating: number;
  avgDifficulty: number;
  numRatings: number;
  wouldTakeAgainPercent: number | null;
  legacyId: number;
  profileUrl: string;
  department: string;
  fullName: string;
  matchScore: number;
  matchReason: string;
}> {
  return Object.fromEntries(
    records
      .filter(
        (record) =>
          record.match && record.match.matchScore >= APP_CONFIDENCE_THRESHOLD
      )
      .map((record) => [
        record.instructorName,
        {
          avgRating: record.match!.avgRating,
          avgDifficulty: record.match!.avgDifficulty,
          numRatings: record.match!.numRatings,
          wouldTakeAgainPercent: record.match!.wouldTakeAgainPercent,
          legacyId: record.match!.legacyId,
          profileUrl: record.match!.profileUrl,
          department: record.match!.department,
          fullName: record.match!.fullName,
          matchScore: record.match!.matchScore,
          matchReason: record.match!.matchReason,
        },
      ])
  );
}

async function main(): Promise<void> {
  const sections = (await readJsonFile<Section[]>(SECTIONS_PATH)) ?? [];
  const instructorNames = Array.from(
    new Set(
      sections.flatMap((section) =>
        (section.instructors ?? [])
          .flatMap(expandInstructorNames)
          .map(cleanInstructorName)
          .filter((name) => name && !/staff/i.test(name))
      )
    )
  ).sort((a, b) => a.localeCompare(b));

  const selectedNames = instructorNames
    .filter((name) => !onlyInstructor || name.toLowerCase().includes(onlyInstructor.toLowerCase()))
    .slice(0, limit ?? undefined);
  const records = await loadExistingRecords();
  const lastSyncedAt = new Date().toISOString();

  console.log(
    `Rate My Professors UC Davis scrape: ${selectedNames.length}/${instructorNames.length} instructors` +
      (dryRun ? " (dry run)" : "")
  );

  let searched = 0;
  let matched = 0;
  let failed = 0;

  for (let index = 0; index < selectedNames.length; index++) {
    const instructorName = selectedNames[index];
    const parsed = parseInstructorName(instructorName);
    const progress = `[${index + 1}/${selectedNames.length}]`;

    try {
      console.log(`${progress} ${instructorName}: searching "${parsed.searchText}"`);
      const teachers = await searchRateMyProfessors(parsed.searchText);
      searched += 1;
      const record = buildRecord(instructorName, sections, teachers, lastSyncedAt);
      if (record.match) matched += 1;
      records.set(instructorName, record);
      console.log(
        `${progress} ${instructorName}: ${
          record.match
            ? `matched ${record.match.fullName} (${record.match.avgRating}/5, ${record.match.numRatings} ratings, score ${record.match.matchScore})`
            : `no confident match (${teachers.length} candidate${teachers.length === 1 ? "" : "s"})`
        }`
      );

      if (!dryRun) {
        await writeJsonFile(
          OUT_PATH,
          Array.from(records.values()).sort((a, b) =>
            a.instructorName.localeCompare(b.instructorName)
          )
        );
      }

      if (delayMs > 0 && index < selectedNames.length - 1) {
        await delay(delayMs);
      }
    } catch (error) {
      failed += 1;
      console.error(
        `${progress} ${instructorName}: failed - ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  }

  const allRecords = Array.from(records.values()).sort((a, b) =>
    a.instructorName.localeCompare(b.instructorName)
  );
  const summary = {
    source: "Rate My Professors",
    schoolId: SCHOOL_LEGACY_ID,
    schoolName: SCHOOL_NAME,
    lastSyncedAt,
    totalFall2026Instructors: instructorNames.length,
    selectedInstructors: selectedNames.length,
    searched,
    matchedThisRun: matched,
    failedThisRun: failed,
    totalStoredRecords: allRecords.length,
    totalStoredMatches: allRecords.filter((record) => record.match).length,
    appConfidenceThreshold: APP_CONFIDENCE_THRESHOLD,
    appUsableMatches: allRecords.filter(
      (record) => record.match && record.match.matchScore >= APP_CONFIDENCE_THRESHOLD
    ).length,
    lowConfidenceOrNoMatch: allRecords.filter((record) => !record.match).length,
    outputPath: OUT_PATH,
    highConfidenceOutputPath: HIGH_CONFIDENCE_OUT_PATH,
  };

  if (!dryRun) {
    await writeJsonFile(OUT_PATH, allRecords);
    await writeJsonFile(HIGH_CONFIDENCE_OUT_PATH, buildHighConfidenceAppData(allRecords));
    await writeJsonFile(SUMMARY_PATH, summary);
  }

  console.log("\nRate My Professors scrape summary");
  console.log(`Searched this run: ${searched}`);
  console.log(`Matched this run: ${matched}`);
  console.log(`Failed this run: ${failed}`);
  console.log(`Total stored records: ${summary.totalStoredRecords}`);
  console.log(`Total stored matches: ${summary.totalStoredMatches}`);
  console.log(`App-usable matches >= ${APP_CONFIDENCE_THRESHOLD}: ${summary.appUsableMatches}`);
  console.log(`Output file: ${OUT_PATH}`);
  console.log(`High-confidence app file: ${HIGH_CONFIDENCE_OUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
