import fs from "fs";
import path from "path";
import {
  normalizeRequirementSections,
  type NormalizedRequirementItem,
} from "../lib/requirement-normalizer";
import type { ScrapedProgram } from "../lib/course-data";

const majorsDir = path.join(process.cwd(), "data", "majors");

function countRawCourses(program: ScrapedProgram) {
  return program.requirements.reduce(
    (sum, section) => sum + section.courses.filter(Boolean).length,
    0
  );
}

function itemCourses(item: NormalizedRequirementItem) {
  if (item.kind === "series" && item.options?.length) {
    return item.options.map((option) => option.join(" + ")).join(" OR ");
  }
  return item.courses.join(", ");
}

function hasDeliveryVariant(item: NormalizedRequirementItem) {
  return item.courses.some((code) => /^[A-Z]{2,4}\s+\d{3}[A-Z]?([VY])$/.test(code));
}

function hasCrossListing(item: NormalizedRequirementItem) {
  return item.courses.length > 1 && new Set(item.courses.map((code) => code.slice(0, 3))).size > 1;
}

const files = fs.readdirSync(majorsDir).filter((file) => file.endsWith(".json")).sort();
let rawCourseCount = 0;
let normalizedRequirementCount = 0;
let sectionCount = 0;
let choiceItemCount = 0;
let seriesItemCount = 0;
let collapsedSectionCount = 0;
let deliveryVariantItemCount = 0;
let crosslistedItemCount = 0;
const examples: string[] = [];

for (const file of files) {
  const program = JSON.parse(
    fs.readFileSync(path.join(majorsDir, file), "utf-8")
  ) as ScrapedProgram;
  const normalized = normalizeRequirementSections(program.requirements);

  rawCourseCount += countRawCourses(program);
  sectionCount += program.requirements.length;

  for (let index = 0; index < normalized.length; index++) {
    const section = normalized[index];
    const rawSection = program.requirements[index];
    const rawCount = rawSection?.courses.length ?? 0;
    const normalizedCount = section.items.reduce((sum, item) => sum + item.requiredCount, 0);
    normalizedRequirementCount += normalizedCount;
    if (rawCount > normalizedCount) {
      collapsedSectionCount += 1;
      if (examples.length < 20) {
        examples.push(
          `${program.name} / ${section.heading}: ${rawCount} listed -> ${normalizedCount} required (${section.items.map(itemCourses).join(" | ")})`
        );
      }
    }

    for (const item of section.items) {
      if (item.kind === "choice") choiceItemCount += 1;
      if (item.kind === "series") seriesItemCount += 1;
      if (hasDeliveryVariant(item)) deliveryVariantItemCount += 1;
      if (hasCrossListing(item)) crosslistedItemCount += 1;
    }
  }
}

console.log(JSON.stringify({
  programs: files.length,
  sections: sectionCount,
  rawCourseListings: rawCourseCount,
  normalizedRequiredSlots: normalizedRequirementCount,
  collapsedSections: collapsedSectionCount,
  choiceItems: choiceItemCount,
  seriesOrPathItems: seriesItemCount,
  deliveryVariantItems: deliveryVariantItemCount,
  crosslistedChoiceItems: crosslistedItemCount,
  examples,
}, null, 2));
