import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import type { ScrapedProgram } from "../lib/course-data";

const MAJORS_DIR = path.join(process.cwd(), "data", "majors");
const REPORT_PATH = path.join(process.cwd(), "data", "major-requirement-verification.json");
const CONCURRENCY = 6;

interface OfficialProgramSnapshot {
  catalogYear: string;
  totalUnits: string;
  courseCodes: string[];
  requirementText: string;
}

interface ProgramVerification {
  file: string;
  name: string;
  url: string;
  ok: boolean;
  localTotalUnits: string;
  officialTotalUnits: string;
  localCourseCount: number;
  officialCourseCount: number;
  missingInLocal: string[];
  extraInLocal: string[];
  fetchError?: string;
}

function normalizeWhitespace(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function normalizeCode(code: string) {
  return normalizeWhitespace(code)
    .replace(/\u00a0/g, " ")
    .replace(/^or\s+/i, "")
    .replace(/\s+DISCONTINUED.*$/i, "")
    .toUpperCase();
}

function splitRepeatedSubjectCourses(raw: string): string[] {
  const cleaned = normalizeCode(raw);
  const subjectMatch = cleaned.match(/^([A-Z]{2,4})\s+(.+)$/);
  if (!subjectMatch) return [cleaned];

  const [, subject, rest] = subjectMatch;
  const numbers = rest.match(/\d{3}[A-Z]{0,2}/g);
  if (numbers && numbers.join("") === rest) {
    return numbers.map((number) => `${subject} ${number}`);
  }

  return [cleaned];
}

function expandCrossListed(raw: string): string[] {
  const cleaned = normalizeCode(raw);
  const sharedNumber = cleaned.match(/^([A-Z]{2,4}(?:\/[A-Z]{2,4})+)\s+(\d{3}[A-Z]{0,2})$/);
  if (sharedNumber) {
    return sharedNumber[1].split("/").map((subject) => `${subject} ${sharedNumber[2]}`);
  }

  if (cleaned.includes("/")) {
    const parts = cleaned.split("/").map((part) => normalizeCode(part));
    if (parts.every((part) => /^[A-Z]{2,4}\s+\d{3}[A-Z]{0,2}$/.test(part))) {
      return parts;
    }
  }

  return [cleaned];
}

function extractCourseCodes(text: string): string[] {
  const normalized = normalizeWhitespace(text.replace(/\u00a0/g, " "));
  const codes = new Set<string>();
  const regex = /\b(?:or\s+)?([A-Z]{2,4}(?:\/[A-Z]{2,4})*)\s+(\d{3}[A-Z]{0,2})(?=(?:\b|\/))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalized)) !== null) {
    const start = match.index;
    const rest = normalized.slice(start);
    const slashChain = rest.match(/^(?:or\s+)?[A-Z]{2,4}\s+\d{3}[A-Z]{0,2}(?:\/[A-Z]{2,4}\s+\d{3}[A-Z]{0,2})+/);
    if (slashChain) {
      for (const code of expandCrossListed(slashChain[0])) {
        codes.add(code);
      }
      regex.lastIndex = start + slashChain[0].length;
      continue;
    }

    for (const repeated of splitRepeatedSubjectCourses(`${match[1]} ${match[2]}`)) {
      for (const code of expandCrossListed(repeated)) {
        codes.add(code);
      }
    }
  }

  return [...codes].sort();
}

function localCourseCodes(program: ScrapedProgram) {
  const codes = new Set<string>();
  for (const section of program.requirements || []) {
    for (const raw of section.courses || []) {
      for (const code of extractCourseCodes(raw)) codes.add(code);
    }
  }
  return [...codes].sort();
}

function parseTotalUnits($: cheerio.CheerioAPI, bodyText: string) {
  let totalUnits = "";

  requirementTables($).each((_, table) => {
    if (isSkippedRequirementTable(nearestHeading($, table))) return;
    $(table)
      .find("tr")
      .each((_, row) => {
        const text = normalizeWhitespace($(row).text());
        if (/^Total Units\b/i.test(text)) {
          const units = $(row).find(".hourscol").last().text().trim();
          if (units) totalUnits = units;
        }
      });
  });

  if (totalUnits) return totalUnits;

  const minimumMatch = bodyText.match(/minimum number of units required .*? is (\d+(?:-\d+)?)/i);
  if (minimumMatch) return minimumMatch[1];

  const totalMatch = bodyText.match(/Total Units\s+(\d+(?:-\d+)?)/i);
  return totalMatch?.[1] ?? "";
}

function nearestHeading($: cheerio.CheerioAPI, element: any) {
  let node = $(element).prev();
  while (node.length) {
    const tag = node[0]?.tagName?.toLowerCase();
    if (tag && /^h[1-6]$/.test(tag)) return normalizeWhitespace(node.text());
    node = node.prev();
  }
  return "";
}

function requirementTables($: cheerio.CheerioAPI) {
  const scoped = $("#requirementstextcontainer table.sc_courselist");
  return scoped.length > 0 ? scoped : $("table.sc_courselist");
}

function isSkippedRequirementTable(heading: string) {
  return /\b(?:recommended|not required|do not count|does not count)\b/i.test(heading);
}

function parseOfficial(html: string): OfficialProgramSnapshot {
  const $ = cheerio.load(html);
  const bodyText = normalizeWhitespace($("body").text());
  const catalogYear = bodyText.match(/\b20\d{2}-20\d{2} General Catalog\b/)?.[0] ?? "";
  const codes = new Set<string>();
  const requirementTextParts: string[] = [];

  requirementTables($).each((_, table) => {
    if (isSkippedRequirementTable(nearestHeading($, table))) return;
    let recommended = false;

    $(table)
      .find("tr")
      .each((_, row) => {
        const $row = $(row);
        const rowText = normalizeWhitespace($row.text());
        if (!rowText || /^Code Title Units$/i.test(rowText)) return;

        const isHeader =
          $row.hasClass("areaheader") ||
          $row.hasClass("areasubheader") ||
          /\bSubtotal\b/i.test(rowText) ||
          /^Total Units\b/i.test(rowText);
        if (isHeader) recommended = false;
        if (/recommended,\s*not required/i.test(rowText)) recommended = true;

        requirementTextParts.push(rowText);

        if (recommended) return;
        const codeText = normalizeWhitespace($row.find("td.codecol").first().text());
        if (!codeText) return;
        for (const code of extractCourseCodes(codeText)) {
          codes.add(code);
        }
      });
  });

  return {
    catalogYear,
    totalUnits: parseTotalUnits($, bodyText),
    courseCodes: [...codes].sort(),
    requirementText: requirementTextParts.join("\n"),
  };
}

async function verifyFile(file: string): Promise<ProgramVerification> {
  const program = JSON.parse(
    fs.readFileSync(path.join(MAJORS_DIR, file), "utf-8")
  ) as ScrapedProgram;
  const localCodes = localCourseCodes(program);

  try {
    const response = await fetch(program.url);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const official = parseOfficial(await response.text());
    const officialCodes = official.courseCodes;
    const localSet = new Set(localCodes);
    const officialSet = new Set(officialCodes);
    const missingInLocal = officialCodes.filter((code) => !localSet.has(code));
    const extraInLocal = localCodes.filter((code) => !officialSet.has(code));
    const totalMatches =
      !official.totalUnits ||
      !program.total_units ||
      official.totalUnits === program.total_units ||
      official.totalUnits.split("-")[0] === program.total_units;

    return {
      file,
      name: program.name,
      url: program.url,
      ok: missingInLocal.length === 0 && extraInLocal.length === 0 && totalMatches,
      localTotalUnits: program.total_units || "",
      officialTotalUnits: official.totalUnits,
      localCourseCount: localCodes.length,
      officialCourseCount: officialCodes.length,
      missingInLocal,
      extraInLocal,
    };
  } catch (error) {
    return {
      file,
      name: program.name,
      url: program.url,
      ok: false,
      localTotalUnits: program.total_units || "",
      officialTotalUnits: "",
      localCourseCount: localCodes.length,
      officialCourseCount: 0,
      missingInLocal: [],
      extraInLocal: [],
      fetchError: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runPool<T, R>(items: T[], worker: (item: T) => Promise<R>) {
  const results: R[] = [];
  let index = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (index < items.length) {
      const current = items[index++];
      results.push(await worker(current));
      process.stdout.write(`Verified ${results.length}/${items.length}\r`);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  const files = fs.readdirSync(MAJORS_DIR).filter((file) => file.endsWith(".json")).sort();
  const results = (await runPool(files, verifyFile)).sort((a, b) => a.file.localeCompare(b.file));
  const summary = {
    generatedAt: new Date().toISOString(),
    source: "UC Davis 2026-2027 General Catalog program URLs stored in data/majors",
    programsChecked: results.length,
    exactMatches: results.filter((result) => result.ok).length,
    programsWithMissingLocalCourses: results.filter((result) => result.missingInLocal.length > 0).length,
    programsWithExtraLocalCourses: results.filter((result) => result.extraInLocal.length > 0).length,
    programsWithTotalUnitMismatch: results.filter(
      (result) =>
        result.officialTotalUnits &&
        result.localTotalUnits &&
        result.officialTotalUnits !== result.localTotalUnits &&
        result.officialTotalUnits.split("-")[0] !== result.localTotalUnits
    ).length,
    fetchErrors: results.filter((result) => result.fetchError).length,
  };

  const report = { summary, results };
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2));
  console.log(`\n${JSON.stringify(summary, null, 2)}`);
  console.log(`Report written to ${REPORT_PATH}`);

  if (
    summary.exactMatches !== summary.programsChecked ||
    summary.programsWithMissingLocalCourses > 0 ||
    summary.programsWithExtraLocalCourses > 0 ||
    summary.programsWithTotalUnitMismatch > 0 ||
    summary.fetchErrors > 0
  ) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
