import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";

const API_BASE =
  "https://catalog.ucdavis.edu/course-search/api/?page=fose";
const CATALOG_YEAR = "";
const BATCH_SIZE = 20;
const DELAY_MS = 300;
const DATA_DIR = path.join(__dirname, "..", "data");
const OUT_PATH = path.join(DATA_DIR, "courses-full.json");
const PROGRESS_PATH = path.join(DATA_DIR, ".scrape-progress.json");

interface CourseStub {
  key: string;
  code: string;
  title: string;
}

interface ScrapedCourse {
  code: string;
  title: string;
  units: string;
  description: string;
  prerequisites: string;
  offered: string[];
  ge_areas: string[];
  department: string;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function parseUnits(html: string): string {
  const match = html.match(/(\d[\d\-\.]*)\s*unit/i);
  return match ? match[1] : html.replace(/<[^>]+>/g, "").trim();
}

function parseGE(detailsHtml: string): string[] {
  const areas: string[] = [];
  const $ = cheerio.load(detailsHtml);
  const text = $.text();
  const geMatch = text.match(
    /General Education[:\s]*(.*?)(?:\.|$)/i
  );
  if (geMatch) {
    const geText = geMatch[1];
    const areaMap: Record<string, string> = {
      "Arts & Humanities": "AH",
      "Arts and Humanities": "AH",
      "Science & Engineering": "SE",
      "Science and Engineering": "SE",
      "Social Sciences": "SS",
      "Writing Experience": "WE",
      "Oral Literacy": "OL",
      "Visual Literacy": "VL",
      "American Cultures": "ACGH",
      "Domestic Diversity": "DD",
      "World Cultures": "WC",
      "Quantitative Literacy": "QL",
      "Scientific Literacy": "SL",
    };
    for (const [name, code] of Object.entries(areaMap)) {
      if (geText.includes(name)) areas.push(code);
    }
    const parenCodes = geText.match(/\(([A-Z]{2,4})\)/g);
    if (parenCodes) {
      for (const pc of parenCodes) {
        const c = pc.replace(/[()]/g, "");
        if (!areas.includes(c)) areas.push(c);
      }
    }
  }
  return areas;
}

function parseDept(code: string): string {
  return code.replace(/\s*\d.*$/, "").trim();
}

async function fetchSearch(): Promise<{ stubs: CourseStub[]; srcdb: string }> {
  console.log("Fetching course index...");
  const resp = await fetch(`${API_BASE}&route=search`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      other: { srcdb: CATALOG_YEAR },
      criteria: [],
    }),
  });
  if (!resp.ok) throw new Error(`Search failed: ${resp.status}`);
  const data = await resp.json();
  const srcdb = data.srcdb || "2025";
  console.log(`Found ${data.count ?? data.results?.length ?? "?"} courses (srcdb: ${srcdb})`);
  const stubs = (data.results || []).map((r: any) => ({
    key: r.key,
    code: (r.code || "").replace(/&amp;/g, "&"),
    title: (r.title || "").replace(/&amp;/g, "&"),
  }));
  return { stubs, srcdb };
}

async function fetchDetail(
  stub: CourseStub,
  srcdb: string
): Promise<ScrapedCourse | null> {
  try {
    const resp = await fetch(`${API_BASE}&route=details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        group: `key:${stub.key}`,
        srcdb,
        matched: `key:${stub.key}`,
      }),
    });
    if (!resp.ok) return null;
    const d = await resp.json();
    const desc = (d.description || "")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const prereq = (d.prerequisite || "")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/\s+/g, " ")
      .trim();
    const ge = parseGE(d.coursedetails || "");
    return {
      code: d.code || stub.code,
      title: (d.title || stub.title).replace(/\s+/g, " ").trim(),
      units: parseUnits(d.hours_html || ""),
      description: desc,
      prerequisites: prereq,
      offered: [],
      ge_areas: ge,
      department: parseDept(d.code || stub.code),
    };
  } catch {
    return null;
  }
}

function loadProgress(): Set<string> {
  try {
    const data = JSON.parse(fs.readFileSync(PROGRESS_PATH, "utf-8"));
    return new Set(data.completed || []);
  } catch {
    return new Set();
  }
}

function saveProgress(completed: Set<string>) {
  fs.writeFileSync(
    PROGRESS_PATH,
    JSON.stringify({ completed: [...completed] })
  );
}

function loadPartialResults(): ScrapedCourse[] {
  try {
    return JSON.parse(fs.readFileSync(OUT_PATH, "utf-8"));
  } catch {
    return [];
  }
}

async function main() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  const { stubs, srcdb } = await fetchSearch();
  if (stubs.length === 0) {
    console.error("No courses found. Check API connectivity.");
    process.exit(1);
  }

  const completed = loadProgress();
  const results = loadPartialResults();
  const existingCodes = new Set(results.map((r) => r.code));

  const remaining = stubs.filter(
    (s) => !completed.has(s.key) && !existingCodes.has(s.code)
  );
  console.log(
    `${completed.size} already done, ${remaining.length} remaining`
  );

  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((s) => fetchDetail(s, srcdb))
    );

    for (let j = 0; j < batch.length; j++) {
      completed.add(batch[j].key);
      if (batchResults[j]) {
        results.push(batchResults[j]!);
      }
    }

    if ((i / BATCH_SIZE) % 5 === 0 || i + BATCH_SIZE >= remaining.length) {
      fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
      saveProgress(completed);
      const pct = Math.min(
        100,
        Math.round(((i + BATCH_SIZE) / remaining.length) * 100)
      );
      console.log(
        `Progress: ${results.length} courses saved (${pct}%)`
      );
    }

    await sleep(DELAY_MS);
  }

  fs.writeFileSync(OUT_PATH, JSON.stringify(results, null, 2));
  if (fs.existsSync(PROGRESS_PATH)) fs.unlinkSync(PROGRESS_PATH);
  console.log(`Done! Wrote ${results.length} courses to ${OUT_PATH}`);
}

main().catch((err) => {
  console.error("Scrape failed:", err);
  process.exit(1);
});
