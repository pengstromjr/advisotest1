import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

const CATALOG_BASE = "https://catalog.ucdavis.edu";
const PROGRAMS_URL = `${CATALOG_BASE}/departments-programs-degrees/`;
const DATA_DIR = path.join(process.cwd(), "data", "majors");
const CONCURRENCY = 6;

const UNDERGRAD_PATTERNS = ["Bachelor of Arts", "Bachelor of Science", ", Minor"];
const EXCLUDE_PATTERNS = [
  "Master",
  "Doctor",
  "Ph.D",
  "M.A.",
  "M.S.",
  "M.F.A",
  "M.B.A",
  "M.Eng",
  "Designated Emphasis",
  "Credential",
  "Certificate",
  "Juris",
  "Medicine",
  "Nursing",
  "Veterinary",
  "Individual",
];

interface ProgramLink {
  name: string;
  url: string;
}

interface RequirementSection {
  heading: string;
  courses: string[];
  units: string;
  notes: string[];
  group?: string;
  group_kind?: "path";
}

interface ProgramData {
  name: string;
  url: string;
  degree_type: string;
  department: string;
  description: string;
  requirements: RequirementSection[];
  specializations: string[];
  advising_notes: string[];
  total_units: string;
  catalog_year: string;
  scraped_at: string;
}

function normalizeWhitespace(text: string) {
  return text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
}

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseDegreeType(name: string): string {
  if (name.includes("Bachelor of Science")) return "B.S.";
  if (name.includes("Bachelor of Arts")) return "B.A.";
  if (name.includes("Minor")) return "Minor";
  return "Unknown";
}

function parseDepartment(url: string): string {
  const segment = url.split("/departments-programs-degrees/")[1]?.split("/")[0] ?? "";
  return segment.replace(/-/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeCode(code: string) {
  return normalizeWhitespace(code)
    .replace(/^or\s+/i, "")
    .replace(/\s+DISCONTINUED.*$/i, "")
    .toUpperCase();
}

function splitRepeatedSubjectCourses(raw: string): string[] {
  const cleaned = normalizeCode(raw);
  const match = cleaned.match(/^([A-Z]{2,4})\s+(.+)$/);
  if (!match) return [cleaned];

  const [, subject, rest] = match;
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
  const normalized = normalizeWhitespace(text);
  const codes = new Set<string>();
  const regex = /\b(?:or\s+)?([A-Z]{2,4}(?:\/[A-Z]{2,4})*)\s+(\d{3}[A-Z]{0,2})(?=(?:\b|\/))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalized)) !== null) {
    const start = match.index;
    const rest = normalized.slice(start);
    const slashChain = rest.match(/^(?:or\s+)?[A-Z]{2,4}\s+\d{3}[A-Z]{0,2}(?:\/[A-Z]{2,4}\s+\d{3}[A-Z]{0,2})+/);
    if (slashChain) {
      for (const code of expandCrossListed(slashChain[0])) codes.add(code);
      regex.lastIndex = start + slashChain[0].length;
      continue;
    }

    for (const repeated of splitRepeatedSubjectCourses(`${match[1]} ${match[2]}`)) {
      for (const code of expandCrossListed(repeated)) codes.add(code);
    }
  }

  return [...codes];
}

function extractCourseEntries(text: string): string[] {
  const normalized = normalizeWhitespace(text);
  const entries: string[] = [];
  const regex = /\b(?:or\s+)?([A-Z]{2,4}(?:\/[A-Z]{2,4})*)\s+(\d{3}[A-Z]{0,2})(?=(?:\b|\/))/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(normalized)) !== null) {
    const start = match.index;
    const rest = normalized.slice(start);
    const slashChain = rest.match(/^(?:or\s+)?[A-Z]{2,4}\s+\d{3}[A-Z]{0,2}(?:\/[A-Z]{2,4}\s+\d{3}[A-Z]{0,2})+/);
    if (slashChain) {
      entries.push(normalizeCode(slashChain[0]));
      regex.lastIndex = start + slashChain[0].length;
      continue;
    }

    for (const repeated of splitRepeatedSubjectCourses(`${match[1]} ${match[2]}`)) {
      entries.push(normalizeCode(repeated));
    }
  }

  return [...new Set(entries)];
}

function parseCatalogYear($: cheerio.CheerioAPI) {
  return normalizeWhitespace($("body").text()).match(/\b20\d{2}-20\d{2} General Catalog\b/)?.[0] ?? "";
}

function parseTotalUnits($: cheerio.CheerioAPI) {
  let totalUnits = "";
  requirementTables($).each((_, table) => {
    if (isSkippedRequirementTable(nearestHeading($, table))) return;
    $(table)
      .find("tr")
      .each((_, row) => {
        const $row = $(row);
        const rowText = normalizeWhitespace($row.text());
        if (/^Total Units\b/i.test(rowText)) {
          const units = normalizeWhitespace($row.find(".hourscol").last().text());
          if (units) totalUnits = units;
        }
      });
  });

  if (totalUnits) return totalUnits;

  const bodyText = normalizeWhitespace($("body").text());
  const minimumMatch = bodyText.match(/minimum number of units required .*? is (\d+(?:-\d+)?)/i);
  if (minimumMatch) return minimumMatch[1];

  return bodyText.match(/Total Units\s+(\d+(?:-\d+)?)/i)?.[1] ?? "";
}

function rowHeading($row: cheerio.Cheerio<any>) {
  return normalizeWhitespace($row.find("span").first().text()) || normalizeWhitespace($row.text().replace($row.find(".hourscol").text(), ""));
}

function appendNote(section: RequirementSection | null, note: string) {
  if (!section) return;
  const cleaned = normalizeWhitespace(note);
  if (cleaned && !section.notes.includes(cleaned)) section.notes.push(cleaned);
}

function isChoiceInstruction(note: string) {
  return /^(?:choose|select|take)\b/i.test(note);
}

function cleanCatalogNote(rowText: string, units = "") {
  let note = normalizeWhitespace(rowText);
  if (units) {
    note = note.replace(new RegExp(`\\s*${escapeRegExp(units)}$`), "").trim();
  }
  note = note.replace(/^Total Units\s*/i, "Total Units");
  if (/^Total Units/i.test(note)) return "";
  if (units && !/\bunits?\b/i.test(note) && !/:\s*$/.test(note)) {
    note = `${note} (${units} units)`;
  }
  return note;
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

function isRequirementPathHeading(heading: string) {
  const text = normalizeWhitespace(heading);
  if (!text || isSkippedRequirementTable(text)) return false;
  if (/^(?:requirements?|major requirements?|minor requirements?|preparation|preparatory material|minor)$/i.test(text)) {
    return false;
  }
  if (/\b(?:emphasis|track|option|specialization|concentration|plan|focus|area of study|area of specialization)\b/i.test(text)) {
    return true;
  }
  if (/^[A-Z][A-Za-z &/]+—[A-Z]/.test(text)) return true;
  return false;
}

function parseRequirements($: cheerio.CheerioAPI): RequirementSection[] {
  const sections: RequirementSection[] = [];

  requirementTables($).each((_, table) => {
    const tableHeading = nearestHeading($, table);
    if (isSkippedRequirementTable(tableHeading)) return;
    const group = isRequirementPathHeading(tableHeading) ? tableHeading : "";
    let areaHeading = "General Requirements";
    let subHeading = "";
    let current: RequirementSection | null = null;
    let recommended = false;
    let forceNextCodeAsOr = false;

    const flush = () => {
      if (current && (current.courses.length > 0 || current.notes.length > 0)) {
        current.courses = [...new Set(current.courses)];
        sections.push(current);
      }
      current = null;
    };

    const ensureSection = (fallbackUnits = "") => {
      if (!current) {
        current = {
          heading: subHeading || areaHeading || "General Requirements",
          courses: [],
          units: fallbackUnits,
          notes: [],
          ...(group ? { group, group_kind: "path" as const } : {}),
        };
      } else if (!current.units && fallbackUnits) {
        current.units = fallbackUnits;
      }
      return current;
    };

    $(table)
      .find("tr")
      .each((_, row) => {
        const $row = $(row);
        const rowText = normalizeWhitespace($row.text());
        if (!rowText || /^Code Title Units$/i.test(rowText)) return;

        const units = normalizeWhitespace($row.find(".hourscol").last().text());
        const isAreaHeader = $row.hasClass("areaheader");
        const isSubHeader = $row.hasClass("areasubheader");
        const isSubtotal = /\bSubtotal\b/i.test(rowText);
        const isTotal = /^Total Units\b/i.test(rowText) || /^Total Units\d/i.test(rowText);

        if (isTotal) {
          flush();
          return;
        }

        if (isAreaHeader) {
          flush();
          areaHeading = rowHeading($row) || areaHeading;
          subHeading = "";
          recommended = /recommended,\s*not required/i.test(areaHeading);
          return;
        }

        if (isSubHeader) {
          const heading = rowHeading($row);
          const isRecommendedHeader = /recommended,\s*not required/i.test(heading);
          if (isRecommendedHeader) {
            flush();
            recommended = true;
            return;
          }
          if (/^Option\s+\d+/i.test(heading) && subHeading) {
            const parentHeading = subHeading.replace(/:+$/, "");
            flush();
            current = {
              heading: `${parentHeading}: ${heading}`,
              courses: [],
              units,
              notes: [`${parentHeading}: choose an option`],
              ...(group ? { group, group_kind: "path" as const } : {}),
            };
          } else {
            flush();
            subHeading = heading || subHeading || areaHeading;
            current = {
              heading: subHeading,
              courses: [],
              units,
              notes: [],
              ...(group ? { group, group_kind: "path" as const } : {}),
            };
          }
          recommended = false;
          return;
        }

        if (isSubtotal) {
          appendNote(current, cleanCatalogNote(rowText, units));
          flush();
          recommended = false;
          return;
        }

        if (/recommended,\s*not required/i.test(rowText)) {
          recommended = true;
          appendNote(current, rowText);
          return;
        }

        const codeText = normalizeWhitespace($row.find("td.codecol").first().text());
        const codes = recommended ? [] : extractCourseEntries(codeText);
        if (codes.length > 0) {
          const section = ensureSection(units);
          const isOrRow = /^or\b/i.test(codeText) || forceNextCodeAsOr;
          section.courses.push(...codes.map((code) => (isOrRow ? `or ${code}` : code)));
          forceNextCodeAsOr = false;
          return;
        }

        const note = cleanCatalogNote(rowText, units);
        if (note) {
          if (/^OR\b/i.test(note)) forceNextCodeAsOr = true;
          if (isChoiceInstruction(note) && current && current.courses.length > 0) {
            flush();
            current = {
              heading: subHeading || areaHeading || "General Requirements",
              courses: [],
              units,
              notes: [normalizeWhitespace(note)],
              ...(group ? { group, group_kind: "path" as const } : {}),
            };
            return;
          }
          appendNote(ensureSection(units), note);
        }
      });

    flush();
  });

  if (sections.length === 0) {
    const courses = new Set<string>();
    const root = $("#requirementstextcontainer").length > 0 ? $("#requirementstextcontainer") : $("body");
    root.find("a[href*='/search/?P=']").each((_, el) => {
      for (const code of extractCourseCodes($(el).text())) courses.add(code);
    });
    if (courses.size > 0) {
      sections.push({
        heading: "Required Courses",
        courses: [...courses].sort(),
        units: "",
        notes: [],
      });
    }
  }

  return sections.filter((section) => section.courses.length > 0 || section.notes.length > 0);
}

async function fetchProgramIndex(): Promise<ProgramLink[]> {
  const response = await fetch(PROGRAMS_URL);
  if (!response.ok) throw new Error(`Failed to fetch program index: HTTP ${response.status}`);
  const $ = cheerio.load(await response.text());
  const links = new Map<string, ProgramLink>();

  $("a").each((_, element) => {
    const href = $(element).attr("href") || "";
    const name = normalizeWhitespace($(element).text());
    if (!href.startsWith("/departments-programs-degrees/") || href === "/departments-programs-degrees/" || !name) return;

    const isUndergrad = UNDERGRAD_PATTERNS.some((pattern) => name.includes(pattern));
    const isExcluded = EXCLUDE_PATTERNS.some((pattern) => name.includes(pattern));
    if (isUndergrad && !isExcluded) {
      links.set(href, { name, url: `${CATALOG_BASE}${href}` });
    }
  });

  return [...links.values()];
}

async function scrapeProgram(link: ProgramLink): Promise<ProgramData> {
  const response = await fetch(link.url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const html = await response.text();
  const $ = cheerio.load(html);

  const description = normalizeWhitespace(
    $(".program-description, #textcontainer > p").first().text()
  ).slice(0, 1000);

  const specializations: string[] = [];
  const seenSpecializations = new Set<string>();
  requirementTables($).each((_, table) => {
    const text = nearestHeading($, table);
    if (isRequirementPathHeading(text) && !seenSpecializations.has(text)) {
      seenSpecializations.add(text);
      specializations.push(text);
    }
  });

  const advisingNotes: string[] = [];
  $("h3").each((_, element) => {
    const heading = normalizeWhitespace($(element).text());
    if (!/(recommended|course limit|study abroad|honor|advising|american history)/i.test(heading)) return;
    const body = normalizeWhitespace($(element).nextUntil("h2, h3").text()).slice(0, 800);
    if (body) advisingNotes.push(`${heading}: ${body}`);
  });

  return {
    name: link.name,
    url: link.url,
    degree_type: parseDegreeType(link.name),
    department: parseDepartment(link.url),
    description,
    requirements: parseRequirements($),
    specializations,
    advising_notes: advisingNotes,
    total_units: parseTotalUnits($),
    catalog_year: parseCatalogYear($),
    scraped_at: new Date().toISOString(),
  };
}

async function runPool<T, R>(items: T[], worker: (item: T, index: number) => Promise<R>) {
  const results: R[] = [];
  let index = 0;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (index < items.length) {
      const currentIndex = index++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
  return results;
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const links = await fetchProgramIndex();
  console.log(`Found ${links.length} undergraduate programs`);

  const expectedFiles = new Set(links.map((link) => `${slugify(link.name)}.json`));
  for (const file of fs.readdirSync(DATA_DIR).filter((name) => name.endsWith(".json"))) {
    if (!expectedFiles.has(file)) {
      fs.unlinkSync(path.join(DATA_DIR, file));
      console.log(`Removed stale program file: ${file}`);
    }
  }

  const failures: { name: string; url: string; error: string }[] = [];
  const programs = await runPool(links, async (link, index) => {
    try {
      const program = await scrapeProgram(link);
      process.stdout.write(`Scraped ${index + 1}/${links.length}: ${link.name}\n`);
      return program;
    } catch (error) {
      failures.push({
        name: link.name,
        url: link.url,
        error: error instanceof Error ? error.message : String(error),
      });
      process.stdout.write(`Failed ${index + 1}/${links.length}: ${link.name}\n`);
      return null;
    }
  });

  for (const program of programs) {
    if (!program) continue;
    fs.writeFileSync(
      path.join(DATA_DIR, `${slugify(program.name)}.json`),
      JSON.stringify(program, null, 2)
    );
  }

  console.log(`Done. ${programs.filter(Boolean).length} programs written, ${failures.length} failures.`);
  if (failures.length > 0) {
    fs.writeFileSync(
      path.join(process.cwd(), "data", "major-scrape-failures.json"),
      JSON.stringify(failures, null, 2)
    );
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
