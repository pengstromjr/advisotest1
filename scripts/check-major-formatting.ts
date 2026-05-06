import fs from "fs";
import path from "path";
import {
  filterRequirementSectionsByPath,
  getRequirementPathGroups,
  normalizeRequirementSections,
  type NormalizedRequirementItem,
} from "../lib/requirement-normalizer";
import type { ScrapedProgram } from "../lib/course-data";

const MAJORS_DIR = path.join(process.cwd(), "data", "majors");
const REPORT_PATH = path.join(process.cwd(), "data", "major-formatting-check.json");

type Severity = "error" | "warning";

interface FormattingIssue {
  severity: Severity;
  file: string;
  program?: string;
  location: string;
  message: string;
}

const RAW_COURSE_ENTRY =
  /^(?:or\s+)?[A-Z]{2,4}(?:\/[A-Z]{2,4})*\s+\d{3}[A-Z]{0,2}(?:\/[A-Z]{2,4}\s+\d{3}[A-Z]{0,2})*$/i;
const NORMALIZED_COURSE_CODE = /^[A-Z]{2,4}\s+\d{3}[A-Z]{0,2}$/;
const UNITS_VALUE = /^$|^\d+(?:-\d+)?$/;
const SUSPICIOUS_TEXT = /\b(?:undefined|null|NaN)\b|::|\s{2,}/;

function clean(text: unknown) {
  return String(text ?? "").replace(/\s+/g, " ").trim();
}

function addIssue(
  issues: FormattingIssue[],
  severity: Severity,
  file: string,
  program: string | undefined,
  location: string,
  message: string
) {
  issues.push({ severity, file, program, location, message });
}

function checkText(
  issues: FormattingIssue[],
  file: string,
  program: string | undefined,
  location: string,
  value: unknown
) {
  const text = clean(value);
  if (!text) {
    addIssue(issues, "error", file, program, location, "Required display text is blank.");
    return;
  }
  if (SUSPICIOUS_TEXT.test(text)) {
    addIssue(issues, "error", file, program, location, `Suspicious display text: "${text}"`);
  }
}

function checkItem(
  issues: FormattingIssue[],
  file: string,
  program: string | undefined,
  sectionIndex: number,
  itemIndex: number,
  item: NormalizedRequirementItem
) {
  const location = `normalized[${sectionIndex}].items[${itemIndex}]`;
  checkText(issues, file, program, `${location}.label`, item.label);
  if (!Number.isFinite(item.requiredCount) || item.requiredCount < 1) {
    addIssue(issues, "error", file, program, `${location}.requiredCount`, "Required count must be at least 1.");
  }
  if (!item.courses.length) {
    addIssue(issues, "error", file, program, `${location}.courses`, "Requirement item has no course codes.");
  }
  for (const code of item.courses) {
    if (!NORMALIZED_COURSE_CODE.test(clean(code))) {
      addIssue(issues, "error", file, program, `${location}.courses`, `Malformed normalized course code: "${code}"`);
    }
  }
  if (item.kind === "series" && item.options) {
    for (const [optionIndex, option] of item.options.entries()) {
      if (!option.length) {
        addIssue(issues, "error", file, program, `${location}.options[${optionIndex}]`, "Series option is empty.");
      }
      for (const code of option) {
        if (!NORMALIZED_COURSE_CODE.test(clean(code))) {
          addIssue(issues, "error", file, program, `${location}.options[${optionIndex}]`, `Malformed series course code: "${code}"`);
        }
      }
    }
  }
}

function main() {
  const issues: FormattingIssue[] = [];
  const files = fs.readdirSync(MAJORS_DIR).filter((file) => file.endsWith(".json")).sort();
  const seenNames = new Map<string, string>();
  let rawSections = 0;
  let rawCourseEntries = 0;
  let normalizedSections = 0;
  let normalizedItems = 0;
  let choiceItems = 0;
  let seriesItems = 0;

  for (const file of files) {
    const filePath = path.join(MAJORS_DIR, file);
    let program: ScrapedProgram & { catalog_year?: string };
    try {
      program = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    } catch (error) {
      addIssue(issues, "error", file, undefined, "file", `Invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    checkText(issues, file, program.name, "name", program.name);
    checkText(issues, file, program.name, "url", program.url);
    if (!program.url?.startsWith("https://catalog.ucdavis.edu/departments-programs-degrees/")) {
      addIssue(issues, "error", file, program.name, "url", "Program URL is not an official UC Davis catalog program URL.");
    }
    if (!program.catalog_year) {
      addIssue(issues, "error", file, program.name, "catalog_year", "Missing catalog year.");
    }
    if (seenNames.has(program.name)) {
      addIssue(issues, "error", file, program.name, "name", `Duplicate program name also appears in ${seenNames.get(program.name)}.`);
    }
    seenNames.set(program.name, file);

    if (!Array.isArray(program.requirements) || program.requirements.length === 0) {
      addIssue(issues, "error", file, program.name, "requirements", "Program has no requirement sections.");
      continue;
    }

    rawSections += program.requirements.length;

    for (const [sectionIndex, section] of program.requirements.entries()) {
      const base = `requirements[${sectionIndex}]`;
      checkText(issues, file, program.name, `${base}.heading`, section.heading);
      if (
        program.name === "Philosophy, Bachelor of Arts" &&
        /^\(\d+\)\s+(?:Pre-Law|Pre-Medical|Business|Social Policy|Social Sciences|Physical Sciences|Biological Sciences|Humanities & the Arts|Agricultural & Environmental Science & Policy)\b/i.test(
          clean(section.heading)
        )
      ) {
        addIssue(
          issues,
          "error",
          file,
          program.name,
          `${base}.heading`,
          "Advising-only Philosophy course list was parsed as a degree requirement."
        );
      }
      if (!UNITS_VALUE.test(clean(section.units))) {
        addIssue(issues, "error", file, program.name, `${base}.units`, `Unexpected units value: "${section.units}"`);
      }
      for (const [courseIndex, course] of (section.courses || []).entries()) {
        rawCourseEntries += 1;
        const entry = clean(course);
        if (!RAW_COURSE_ENTRY.test(entry)) {
          addIssue(issues, "error", file, program.name, `${base}.courses[${courseIndex}]`, `Malformed raw course entry: "${entry}"`);
        }
      }
      for (const [noteIndex, note] of (section.notes || []).entries()) {
        const text = clean(note);
        if (text && SUSPICIOUS_TEXT.test(text)) {
          addIssue(issues, "error", file, program.name, `${base}.notes[${noteIndex}]`, `Suspicious note text: "${text}"`);
        }
      }
    }

    const paths = getRequirementPathGroups(program.requirements);
    const pathsToCheck = paths.length > 0 ? paths : [""];

    for (const pathName of pathsToCheck) {
      let normalized;
      const pathRequirements = filterRequirementSectionsByPath(program.requirements, pathName);
      const locationPrefix = pathName ? `normalized[${pathName}]` : "normalized";
      try {
        normalized = normalizeRequirementSections(pathRequirements);
      } catch (error) {
        addIssue(issues, "error", file, program.name, "normalizeRequirementSections", `Normalizer crashed: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }

      if (!normalized.length) {
        addIssue(issues, "error", file, program.name, locationPrefix, "Normalizer returned no displayable sections.");
      }

      normalizedSections += normalized.length;
      for (const [sectionIndex, section] of normalized.entries()) {
        checkText(issues, file, program.name, `${locationPrefix}[${sectionIndex}].heading`, section.heading);
        if (!section.items.length && !section.notes.length) {
          addIssue(issues, "error", file, program.name, `${locationPrefix}[${sectionIndex}].items`, "Display section has no requirement items or explanatory notes.");
        }
        for (const [itemIndex, item] of section.items.entries()) {
          normalizedItems += 1;
          if (item.kind === "choice") choiceItems += 1;
          if (item.kind === "series") seriesItems += 1;
          checkItem(issues, file, program.name, sectionIndex, itemIndex, item);
        }
      }
    }
  }

  const summary = {
    generatedAt: new Date().toISOString(),
    programsChecked: files.length,
    rawSections,
    rawCourseEntries,
    normalizedSections,
    normalizedItems,
    choiceItems,
    seriesItems,
    errors: issues.filter((issue) => issue.severity === "error").length,
    warnings: issues.filter((issue) => issue.severity === "warning").length,
  };
  fs.writeFileSync(REPORT_PATH, JSON.stringify({ summary, issues }, null, 2));
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Report written to ${REPORT_PATH}`);
  if (summary.errors > 0) process.exitCode = 1;
}

main();
