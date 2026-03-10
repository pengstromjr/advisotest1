import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

const CATALOG_BASE = "https://catalog.ucdavis.edu";
const PROGRAMS_URL = `${CATALOG_BASE}/departments-programs-degrees/`;
const DELAY_MS = 500;
const DATA_DIR = path.join(__dirname, "..", "data", "majors");

const UNDERGRAD_PATTERNS = [
  "Bachelor of Arts",
  "Bachelor of Science",
  ", Minor",
];

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

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

interface ProgramLink {
  name: string;
  url: string;
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
}

interface RequirementSection {
  heading: string;
  courses: string[];
  units: string;
  notes: string[];
}

async function fetchProgramIndex(): Promise<ProgramLink[]> {
  console.log("Fetching program index...");
  const resp = await fetch(PROGRAMS_URL);
  if (!resp.ok) throw new Error(`Failed to fetch program index: ${resp.status}`);
  const html = await resp.text();
  const $ = cheerio.load(html);

  const links: ProgramLink[] = [];
  $("a").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().trim();
    if (
      href.startsWith("/departments-programs-degrees/") &&
      href !== "/departments-programs-degrees/" &&
      text.length > 0
    ) {
      const isUndergrad = UNDERGRAD_PATTERNS.some((p) => text.includes(p));
      const isExcluded = EXCLUDE_PATTERNS.some((p) => text.includes(p));
      if (isUndergrad && !isExcluded) {
        links.push({
          name: text,
          url: `${CATALOG_BASE}${href}`,
        });
      }
    }
  });

  const unique = new Map<string, ProgramLink>();
  for (const l of links) unique.set(l.url, l);
  return [...unique.values()];
}

function parseDegreeType(name: string): string {
  if (name.includes("Bachelor of Science")) return "B.S.";
  if (name.includes("Bachelor of Arts")) return "B.A.";
  if (name.includes("Minor")) return "Minor";
  return "Unknown";
}

function parseDepartment(url: string): string {
  const parts = url.split("/departments-programs-degrees/");
  if (parts.length < 2) return "";
  const seg = parts[1].split("/")[0] || "";
  return seg.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function extractCourseCodes(text: string): string[] {
  const codes: string[] = [];
  const regex = /\b([A-Z]{2,4})\s+(\d{3}[A-Z]*(?:\/[A-Z]{2,4}\s+\d{3}[A-Z]*)*)\b/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    codes.push(`${match[1]} ${match[2]}`);
  }
  return codes;
}

async function scrapeProgram(link: ProgramLink): Promise<ProgramData | null> {
  try {
    const resp = await fetch(link.url);
    if (!resp.ok) return null;
    const html = await resp.text();
    const $ = cheerio.load(html);

    const description = $(".program-description, #textcontainer > p")
      .first()
      .text()
      .trim()
      .slice(0, 1000);

    const requirements: RequirementSection[] = [];
    const allCourseLinks: string[] = [];

    $("table.sc_courselist").each((_, table) => {
      let currentHeading = "General Requirements";
      let currentCourses: string[] = [];
      let currentUnits = "";
      const notes: string[] = [];

      $(table)
        .find("tr")
        .each((_, row) => {
          const $row = $(row);

          if (
            $row.hasClass("areaheader") ||
            $row.hasClass("areasubheader")
          ) {
            if (currentCourses.length > 0) {
              requirements.push({
                heading: currentHeading,
                courses: [...currentCourses],
                units: currentUnits,
                notes: [...notes],
              });
              currentCourses = [];
              notes.length = 0;
            }
            currentHeading = $row.find("span").text().trim() || currentHeading;
            currentUnits = $row.find(".hourscol").text().trim();
            return;
          }

          const codeCell = $row.find("td.codecol a");
          if (codeCell.length > 0) {
            const code = codeCell.text().replace(/\s+/g, " ").trim();
            if (code) {
              currentCourses.push(code);
              allCourseLinks.push(code);
            }
          }

          const comment = $row.find(".courselistcomment").text().trim();
          if (comment && !$row.hasClass("areaheader") && !$row.hasClass("areasubheader")) {
            const extracted = extractCourseCodes(comment);
            if (extracted.length > 0) {
              currentCourses.push(...extracted);
              allCourseLinks.push(...extracted);
            } else if (comment.length > 5) {
              notes.push(comment);
            }
          }

          const unitCell = $row.find(".hourscol").text().trim();
          if (unitCell && !currentUnits) currentUnits = unitCell;
        });

      if (currentCourses.length > 0 || notes.length > 0) {
        requirements.push({
          heading: currentHeading,
          courses: currentCourses,
          units: currentUnits,
          notes,
        });
      }
    });

    if (requirements.length === 0) {
      $("a[href*='/search/?P=']").each((_, el) => {
        const code = $(el).text().replace(/\s+/g, " ").trim();
        if (code) allCourseLinks.push(code);
      });
      if (allCourseLinks.length > 0) {
        requirements.push({
          heading: "Required Courses",
          courses: [...new Set(allCourseLinks)],
          units: "",
          notes: [],
        });
      }
    }

    const specializations: string[] = [];
    $("h2, h3").each((_, el) => {
      const text = $(el).text().trim();
      if (
        text.startsWith("Specialization:") ||
        text.startsWith("Emphasis:") ||
        text.startsWith("Track:")
      ) {
        specializations.push(text);
      }
    });

    const advising: string[] = [];
    $("h3")
      .filter((_, el) => {
        const t = $(el).text().toLowerCase();
        return (
          t.includes("recommended") ||
          t.includes("course limit") ||
          t.includes("study abroad") ||
          t.includes("honor") ||
          t.includes("advising") ||
          t.includes("american history")
        );
      })
      .each((_, el) => {
        const section = $(el).text().trim();
        const content = $(el)
          .nextUntil("h2, h3")
          .text()
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 500);
        if (content) advising.push(`${section}: ${content}`);
      });

    const totalUnitsMatch = $("body")
      .text()
      .match(/(?:Total Units|minimum.*?units.*?required)[:\s]*(\d+)/i);
    const totalUnits = totalUnitsMatch ? totalUnitsMatch[1] : "";

    return {
      name: link.name,
      url: link.url,
      degree_type: parseDegreeType(link.name),
      department: parseDepartment(link.url),
      description,
      requirements,
      specializations,
      advising_notes: advising,
      total_units: totalUnits,
    };
  } catch (err) {
    console.error(`  Failed to scrape ${link.name}:`, err);
    return null;
  }
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const links = await fetchProgramIndex();
  console.log(`Found ${links.length} undergraduate programs`);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < links.length; i++) {
    const link = links[i];
    process.stdout.write(
      `[${i + 1}/${links.length}] ${link.name}... `
    );

    const data = await scrapeProgram(link);
    if (data) {
      const filename = `${slugify(data.name)}.json`;
      fs.writeFileSync(
        path.join(DATA_DIR, filename),
        JSON.stringify(data, null, 2)
      );
      console.log(`OK (${data.requirements.length} req sections)`);
      success++;
    } else {
      console.log("FAILED");
      failed++;
    }

    await sleep(DELAY_MS);
  }

  console.log(
    `\nDone! ${success} programs scraped, ${failed} failed.`
  );
}

main().catch((err) => {
  console.error("Program scrape failed:", err);
  process.exit(1);
});
