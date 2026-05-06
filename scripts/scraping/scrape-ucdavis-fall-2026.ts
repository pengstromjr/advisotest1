import fs from "fs/promises";
import path from "path";
import * as cheerio from "cheerio";
import type { Element } from "domhandler";
import { chromium, type APIRequestContext, type Page } from "playwright";
import type { Section, SectionMeeting } from "@/lib/course-data";

type UCDavisClassSection = {
  term: "Fall Quarter 2026";
  source: "UC Davis Public Class Search";
  lastSyncedAt: string;

  subject: string;
  courseNumber: string;
  courseCode: string;
  title: string;
  crn?: string;
  section?: string;
  units?: string;

  instructor?: string;
  days?: string;
  startTime?: string;
  endTime?: string;
  location?: string;
  modality?: string;

  geAreas?: string[];
  seatsAvailable?: number | null;
  seatsCapacity?: number | null;
  waitlistAvailable?: number | null;

  rawText?: string;
  sourceUrl: string;
};

type ScrapeSummary = {
  dryRun: boolean;
  totalSubjectsDiscovered: number;
  totalSubjectsScraped: number;
  totalSectionsScraped: number;
  failedSubjects: string[];
  outputPath: string;
};

const CLASS_SEARCH_INDEX_URL =
  "https://registrar-apps.ucdavis.edu/courses/search/index.cfm";
const CLASS_SEARCH_RESULTS_URL =
  "https://registrar-apps.ucdavis.edu/courses/search/course_search_results.cfm";
const TERM_LABEL = "Fall Quarter 2026" as const;
const TERM_CODE = "202610";
const SOURCE_LABEL = "UC Davis Public Class Search" as const;
const DATA_DIR = path.join(process.cwd(), "data", "ucdavis");
const CACHE_DIR = path.join(DATA_DIR, ".cache", "fall-2026");
const OUT_PATH = path.join(DATA_DIR, "fall-2026-classes.json");
const APP_SECTIONS_DIR = path.join(process.cwd(), "data", "sections");
const APP_OUT_PATH = path.join(APP_SECTIONS_DIR, "fall-2026.json");
const MIN_SUBJECT_DELAY_MS = 750;
const MAX_SUBJECT_DELAY_MS = 1500;
const DRY_RUN_SUBJECT_COUNT = 2;
const RATE_LIMIT_RETRY_MS = 60_000;
const MAX_SUBJECT_ATTEMPTS = 2;

const args = new Set(process.argv.slice(2));
const isDryRun = args.has("--dry-run");
const refreshCache = args.has("--refresh-cache");
const delayArg = process.argv.find((arg) => arg.startsWith("--delay-ms="));
const explicitDelayMs = delayArg ? Number.parseInt(delayArg.slice("--delay-ms=".length), 10) : null;
const requestedSubjects = process.argv
  .slice(2)
  .flatMap((arg) => {
    if (arg.startsWith("--subject=")) return [arg.slice("--subject=".length)];
    if (arg.startsWith("--subjects=")) return arg.slice("--subjects=".length).split(",");
    return [];
  })
  .map((subject) => subject.trim().toUpperCase())
  .filter(Boolean);

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomSubjectDelay(): number {
  if (explicitDelayMs != null && Number.isFinite(explicitDelayMs) && explicitDelayMs >= 0) {
    return explicitDelayMs;
  }
  return (
    MIN_SUBJECT_DELAY_MS +
    Math.floor(Math.random() * (MAX_SUBJECT_DELAY_MS - MIN_SUBJECT_DELAY_MS + 1))
  );
}

function cleanText(value: string | undefined): string {
  return (value ?? "").replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function firstDefined<T>(values: (T | undefined)[]): T | undefined {
  return values.find((value) => value !== undefined);
}

function parseInteger(value: string | undefined): number | null {
  if (!value) return null;
  const match = value.match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
}

function splitCellLines($: cheerio.CheerioAPI, cell: Element): string[] {
  const html = $(cell).html() ?? "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .split("\n")
    .map((line) => cleanText(cheerio.load(line).text()))
    .filter(Boolean);
}

function parseTimeDays(raw: string): {
  days?: string;
  startTime?: string;
  endTime?: string;
} {
  const text = cleanText(raw);
  if (!text || /^TBA$/i.test(text)) {
    return {};
  }

  const match = text.match(
    /^(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})\s*([AP]M),?\s*([A-Z]+)$/i
  );
  if (!match) {
    return {};
  }

  const [, startRaw, endRaw, meridiemRaw, daysRaw] = match;
  const meridiem = meridiemRaw.toUpperCase();

  return {
    days: normalizeDays(daysRaw),
    startTime: normalizeTime(startRaw, meridiem, endRaw),
    endTime: normalizeTime(endRaw, meridiem),
  };
}

function normalizeDays(raw: string): string {
  return raw.toUpperCase().replace(/TH/g, "R");
}

function normalizeTime(
  raw: string,
  meridiem: string,
  endRawForContext?: string
): string {
  const [hourText, minuteText] = raw.split(":");
  let hour = Number.parseInt(hourText, 10);
  const minute = Number.parseInt(minuteText, 10);

  if (endRawForContext && meridiem === "PM") {
    const endHour = Number.parseInt(endRawForContext.split(":")[0], 10);
    const crossesNoon = endHour === 12 && hour < 12;
    if (!crossesNoon && hour !== 12 && hour <= endHour) {
      hour += 12;
    }
  } else if (meridiem === "PM" && hour !== 12) {
    hour += 12;
  } else if (meridiem === "AM" && hour === 12) {
    hour = 0;
  }

  return `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}`;
}

function inferModality(value: string | undefined): string | undefined {
  const text = (value ?? "").toLowerCase();
  if (!text) return undefined;
  if (text.includes("hybrid")) return "hybrid";
  if (text.includes("virtual") || text.includes("online") || text.includes("remote")) {
    return "online";
  }
  if (text.includes("tba")) return undefined;
  return "in-person";
}

function appendUniqueField(
  base: UCDavisClassSection,
  incoming: UCDavisClassSection,
  field: "days" | "startTime" | "endTime" | "location" | "rawText"
): void {
  const nextValue = incoming[field];
  if (!nextValue) return;
  const currentValue = base[field];
  if (!currentValue) {
    base[field] = nextValue;
    return;
  }
  const pieces = new Set(currentValue.split("; ").filter(Boolean));
  if (!pieces.has(nextValue)) {
    pieces.add(nextValue);
    base[field] = Array.from(pieces).join("; ");
  }
}

function dedupeSections(sections: UCDavisClassSection[]): UCDavisClassSection[] {
  const byKey = new Map<string, UCDavisClassSection>();

  for (const section of sections) {
    const key = section.crn
      ? `crn:${section.crn}`
      : `fallback:${section.courseCode}:${section.section ?? ""}:${section.days ?? ""}:${
          section.startTime ?? ""
        }`;
    const existing = byKey.get(key);

    if (!existing) {
      byKey.set(key, { ...section, geAreas: [...(section.geAreas ?? [])] });
      continue;
    }

    appendUniqueField(existing, section, "days");
    appendUniqueField(existing, section, "startTime");
    appendUniqueField(existing, section, "endTime");
    appendUniqueField(existing, section, "location");
    appendUniqueField(existing, section, "rawText");

    existing.geAreas = Array.from(
      new Set([...(existing.geAreas ?? []), ...(section.geAreas ?? [])])
    );
    existing.seatsAvailable = firstDefined([
      section.seatsAvailable,
      existing.seatsAvailable,
    ]);
    existing.seatsCapacity = firstDefined([
      section.seatsCapacity,
      existing.seatsCapacity,
    ]);
    existing.waitlistAvailable = firstDefined([
      section.waitlistAvailable,
      existing.waitlistAvailable,
    ]);
  }

  return Array.from(byKey.values()).sort((a, b) =>
    `${a.subject} ${a.courseNumber} ${a.section ?? ""} ${a.crn ?? ""}`.localeCompare(
      `${b.subject} ${b.courseNumber} ${b.section ?? ""} ${b.crn ?? ""}`
    )
  );
}

function splitCombinedField(value: string | undefined): string[] {
  return (value ?? "")
    .split(";")
    .map((part) => cleanText(part))
    .filter(Boolean);
}

function splitDayCodes(value: string | undefined): string[] {
  const text = (value ?? "").toUpperCase().replace(/TH/g, "R");
  const days: string[] = [];
  for (const day of ["M", "T", "W", "R", "F", "S", "U"]) {
    if (text.includes(day)) days.push(day);
  }
  return days;
}

function normalizeMeetings(section: UCDavisClassSection): SectionMeeting[] {
  const dayParts = splitCombinedField(section.days);
  const startParts = splitCombinedField(section.startTime);
  const endParts = splitCombinedField(section.endTime);
  const locationParts = splitCombinedField(section.location);
  const count = Math.max(dayParts.length, startParts.length, endParts.length, locationParts.length);

  if (count === 0) {
    return [
      {
        days: [],
        startTime: "",
        endTime: "",
        location: "TBA",
      },
    ];
  }

  return Array.from({ length: count }, (_, index) => ({
    days: splitDayCodes(dayParts[index]),
    startTime: startParts[index] ?? "",
    endTime: endParts[index] ?? "",
    location: locationParts[index] ?? "TBA",
  }));
}

function normalizeForApp(sections: UCDavisClassSection[]): Section[] {
  return dedupeSections(sections)
    .filter((section) => /^\d{5}$/.test(section.crn ?? ""))
    .map((section) => ({
      term: TERM_LABEL,
      subject: section.subject,
      courseNumber: section.courseNumber,
      courseCode: section.courseCode,
      title: section.title,
      crn: section.crn ?? "",
      section: section.section ?? "",
      units: section.units ?? "",
      meetings: normalizeMeetings(section),
      instructors: section.instructor ? [section.instructor] : ["The Staff"],
      modality:
        section.modality === "online" || section.modality === "hybrid"
          ? section.modality
          : "in-person",
      seatsTotal: section.seatsCapacity ?? null,
      seatsAvailable: section.seatsAvailable ?? null,
      waitlistTotal: null,
      waitlistAvailable: section.waitlistAvailable ?? null,
      notes: [
        "Source: UC Davis Public Class Search",
        `Last synced: ${section.lastSyncedAt}`,
        "Room/location is not included in public search results until available in course detail.",
      ],
      geAreas: section.geAreas ?? [],
    }));
}

function parseSectionsFromHtml(
  subject: string,
  html: string,
  lastSyncedAt: string
): UCDavisClassSection[] {
  const $ = cheerio.load(html);
  const table = $("#mc_win");
  if (!table.length) return [];

  const sections: UCDavisClassSection[] = [];
  table.find("tr").each((_, row) => {
    const cells = $(row).children("th, td").toArray();
    if (cells.length < 5) return;

    const crnLines = splitCellLines($, cells[0]);
    const courseLines = splitCellLines($, cells[1]);
    const sectionLines = splitCellLines($, cells[2]);
    const titleLines = splitCellLines($, cells[3]);
    const instructorLines = splitCellLines($, cells[4]);

    const crn = crnLines.find((line) => /^\d{5}$/.test(line));
    const timeDays = crnLines.find((line) => line !== crn);
    const courseCode = cleanText(courseLines[0]);
    if (!courseCode || !/^[A-Z]{2,5}\s+\S+/.test(courseCode)) return;

    const courseMatch = courseCode.match(/^([A-Z]{2,5})\s+(.+)$/);
    const parsedSubject = courseMatch?.[1] ?? subject;
    const courseNumber = courseMatch?.[2] ?? "";
    const title = cleanText(titleLines[0]);
    const geAreas = $(cells[3])
      .find("acronym")
      .toArray()
      .map((acronym) => cleanText($(acronym).text()))
      .filter(Boolean);
    const section = sectionLines.find((line) => !line.includes("/"));
    const openWaitlist = sectionLines.find((line) => /\d+\s*\/\s*\d+/.test(line));
    const [openSeats, waitlistSeats] = openWaitlist?.split("/") ?? [];
    const units = instructorLines.find((line) => /^\d+(\.\d+)?$/.test(line));
    const instructor = instructorLines.find((line) => line !== units);
    const parsedTimeDays = parseTimeDays(timeDays ?? "");
    const rawText = cleanText($(row).text());

    sections.push({
      term: TERM_LABEL,
      source: SOURCE_LABEL,
      lastSyncedAt,
      subject: parsedSubject.toUpperCase(),
      courseNumber,
      courseCode,
      title,
      crn,
      section,
      units,
      instructor,
      ...parsedTimeDays,
      modality: inferModality(rawText),
      geAreas,
      seatsAvailable: parseInteger(openSeats),
      seatsCapacity: null,
      waitlistAvailable: parseInteger(waitlistSeats),
      rawText,
      sourceUrl: CLASS_SEARCH_INDEX_URL,
    });
  });

  return dedupeSections(sections);
}

async function discoverSubjects(page: Page): Promise<string[]> {
  await page.goto(CLASS_SEARCH_INDEX_URL, {
    waitUntil: "networkidle",
    timeout: 60_000,
  });
  await page.selectOption("#term", { label: TERM_LABEL });

  const termCode = await page.locator("#term").inputValue();
  if (termCode !== TERM_CODE) {
    throw new Error(`Expected ${TERM_LABEL} to have term code ${TERM_CODE}, got ${termCode}`);
  }

  return page.locator("#subject option").evaluateAll((options) =>
    options
      .map((option) => ({
        value: option.getAttribute("value")?.trim() ?? "",
        text: option.textContent?.trim() ?? "",
      }))
      .filter(({ value }) => /^[A-Z]{2,5}$/.test(value))
      .map(({ value }) => value)
  );
}

async function discoverSubjectsFromCache(): Promise<string[]> {
  const entries = await fs.readdir(CACHE_DIR);
  return entries
    .map((entry) => entry.match(/^([A-Z]{2,5})\.html$/)?.[1])
    .filter((subject): subject is string => Boolean(subject))
    .sort();
}

async function fetchSubjectHtml(
  request: APIRequestContext,
  subject: string
): Promise<{ html: string; fromCache: boolean }> {
  const cachePath = path.join(CACHE_DIR, `${subject}.html`);
  if (!refreshCache) {
    try {
      return { html: await fs.readFile(cachePath, "utf8"), fromCache: true };
    } catch {
      // Cache misses are normal on first run.
    }
  }

  const body = new URLSearchParams({
    termCode: TERM_CODE,
    course_number: "",
    multiCourse: "",
    course_title: "",
    instructor: "",
    subject,
    course_start_eval: "-",
    course_start_time: "-",
    course_end_eval: "-",
    course_end_time: "-",
    course_status: "-",
    course_level: "-",
    course_units: "-",
    virtual: "-",
    runMe: "1",
    clearMe: "1",
    reorder: "",
    gettingResults: "0",
  });

  const response = await request.post(CLASS_SEARCH_RESULTS_URL, {
    headers: {
      Accept: "text/html,application/xhtml+xml",
      "Content-Type": "application/x-www-form-urlencoded",
      Origin: "https://registrar-apps.ucdavis.edu",
      Referer: CLASS_SEARCH_INDEX_URL,
    },
    data: body.toString(),
    timeout: 60_000,
  });

  if (!response.ok()) {
    throw new Error(`HTTP ${response.status()} from UC Davis Class Search`);
  }

  const html = await response.text();
  if (/Over Use|more often than is normally expected|captcha/i.test(html)) {
    throw new Error("UC Davis Class Search returned a rate-limit or CAPTCHA page");
  }

  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.writeFile(cachePath, html);
  return { html, fromCache: false };
}

async function saveSections(sections: UCDavisClassSection[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(APP_SECTIONS_DIR, { recursive: true });
  const deduped = dedupeSections(sections);
  await fs.writeFile(OUT_PATH, `${JSON.stringify(deduped, null, 2)}\n`);
  await fs.writeFile(APP_OUT_PATH, `${JSON.stringify(normalizeForApp(deduped), null, 2)}\n`);
}

async function loadExistingSections(): Promise<UCDavisClassSection[]> {
  try {
    const raw = await fs.readFile(OUT_PATH, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function main(): Promise<ScrapeSummary> {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36",
  });
  const page = await context.newPage();

  const allSections: UCDavisClassSection[] = [];
  const failedSubjects: string[] = [];
  let subjectsScraped = 0;

  try {
    let discoveredSubjects: string[];
    try {
      discoveredSubjects = await discoverSubjects(page);
    } catch (error) {
      if (refreshCache && requestedSubjects.length > 0) {
        discoveredSubjects = requestedSubjects;
        console.warn(
          `Could not load UC Davis subject index; continuing with requested subject filter: ${requestedSubjects.join(", ")}.`
        );
      } else if (refreshCache) {
        throw error;
      } else {
        discoveredSubjects = await discoverSubjectsFromCache();
        console.warn(
          `Could not load UC Davis subject index; rebuilding from ${discoveredSubjects.length} cached subject files.`
        );
      }
    }
    const filteredSubjects = requestedSubjects.length
      ? discoveredSubjects.filter((subject) => requestedSubjects.includes(subject))
      : discoveredSubjects;
    const subjects = isDryRun
      ? filteredSubjects.slice(0, DRY_RUN_SUBJECT_COUNT)
      : filteredSubjects;
    const unknownSubjects = requestedSubjects.filter(
      (subject) => !discoveredSubjects.includes(subject)
    );
    if (unknownSubjects.length) {
      throw new Error(`Unknown subject code(s) for ${TERM_LABEL}: ${unknownSubjects.join(", ")}`);
    }

    const existingSections = await loadExistingSections();
    allSections.push(...existingSections);

    console.log(
      `Discovered ${discoveredSubjects.length} subjects for ${TERM_LABEL}.` +
        (requestedSubjects.length ? ` Subject filter: ${subjects.join(", ")}.` : "") +
        (isDryRun ? ` Dry run will scrape ${subjects.length}.` : "")
    );

    for (let i = 0; i < subjects.length; i++) {
      const subject = subjects[i];
      const progress = `[${i + 1}/${subjects.length}]`;
      let fetchedFromNetwork = false;

      try {
        for (let attempt = 1; attempt <= MAX_SUBJECT_ATTEMPTS; attempt++) {
          console.log(
            `${progress} ${subject}: searching${attempt > 1 ? ` (retry ${attempt})` : ""}...`
          );
          try {
            const { html, fromCache } = await fetchSubjectHtml(page.request, subject);
            fetchedFromNetwork = !fromCache;
            const lastSyncedAt = new Date().toISOString();
            const sections = parseSectionsFromHtml(subject, html, lastSyncedAt);
            for (let index = allSections.length - 1; index >= 0; index--) {
              if (allSections[index]?.subject === subject) {
                allSections.splice(index, 1);
              }
            }
            allSections.push(...sections);
            subjectsScraped += 1;
            console.log(
              `${progress} ${subject}: ${sections.length} sections${
                fromCache ? " (cache)" : ""
              }`
            );
            await saveSections(allSections);
            break;
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            const isRateLimit = /rate-limit|CAPTCHA/i.test(message);
            if (isRateLimit && attempt < MAX_SUBJECT_ATTEMPTS) {
              console.warn(
                `${progress} ${subject}: ${message}. Waiting ${
                  RATE_LIMIT_RETRY_MS / 1000
                }s before one retry.`
              );
              await delay(RATE_LIMIT_RETRY_MS);
              continue;
            }
            throw error;
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failedSubjects.push(`${subject}: ${message}`);
        console.error(`${progress} ${subject}: failed - ${message}`);
        await saveSections(allSections);
      }

      if (fetchedFromNetwork && i < subjects.length - 1) {
        await delay(randomSubjectDelay());
      }
    }

    const deduped = dedupeSections(allSections);
    await saveSections(deduped);

    return {
      dryRun: isDryRun,
      totalSubjectsDiscovered: discoveredSubjects.length,
      totalSubjectsScraped: subjectsScraped,
      totalSectionsScraped: deduped.length,
      failedSubjects,
      outputPath: OUT_PATH,
    };
  } finally {
    await browser.close();
  }
}

main()
  .then((summary) => {
    console.log("\nUC Davis Fall 2026 scrape summary");
    console.log(`Mode: ${summary.dryRun ? "dry run" : "full scrape"}`);
    console.log(`Total subjects discovered: ${summary.totalSubjectsDiscovered}`);
    console.log(`Total subjects scraped: ${summary.totalSubjectsScraped}`);
    console.log(`Total sections scraped: ${summary.totalSectionsScraped}`);
    console.log(
      `Failed subjects: ${summary.failedSubjects.length ? summary.failedSubjects.join("; ") : "none"}`
    );
    console.log(`Output file: ${summary.outputPath}`);
    console.log(`App-ready sections file: ${APP_OUT_PATH}`);
    console.log(
      "Notice: This file contains unofficial public UC Davis Class Search data. Students should verify schedule details with UC Davis before planning or registering."
    );
  })
  .catch((error) => {
    console.error("Scrape failed:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
