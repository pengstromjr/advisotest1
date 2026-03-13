import fs from "fs";
import path from "path";
import * as cheerio from "cheerio";
import type { Section, SectionMeeting } from "@/lib/course-data";

const CLASS_SEARCH_INDEX_URL =
  "https://registrar-apps.ucdavis.edu/courses/search/index.cfm";
const CLASS_SEARCH_RESULTS_URL =
  "https://registrar-apps.ucdavis.edu/courses/search/course_search_results.cfm";
const CATALOG_FOSE_URL =
  "https://catalog.ucdavis.edu/course-search/api/?page=fose&route=search";

const TERM_CODE = "202603";
const TERM_LABEL = "Spring Quarter 2026";

const DATA_DIR = path.join(__dirname, "..", "data", "sections");
const OUT_PATH = path.join(DATA_DIR, "spring-2026.json");

const BROWSER_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const BASE_DELAY_MS = 3000;
const MAX_DELAY_MS = 8000;
const RATE_LIMIT_BACKOFF_MS = 60_000;
const MAX_RETRIES = 4;

const FALLBACK_SUBJECTS: string[] = [
  "AAS","ABG","ABI","ABS","ABT","ACC","AED","AGC","AGE","AGR","AHI","AMR","AMS",
  "ANB","ANE","ANG","ANS","ANT","APC","ARB","ARE","ART","ASA","ASE","AST","ATM",
  "AVS","BAX","BCB","BCM","BIM","BIO","BIS","BIT","BMB","BPH","BPT","BST","CAN",
  "CAR","CDB","CDM","CEL","CGS","CHA","CHE","CHI","CHN","CLA","CLH","CLR","CMH",
  "CMN","CNE","CNS","COM","CPS","CRD","CRI","CRO","CSM","CST","CTS","DAN","DEB",
  "DER","DES","DRA","DSC","DVM","EAD","EAE","EAL","EAP","EAS","EBS","ECH","ECI",
  "ECL","ECM","ECN","ECS","EDO","EDU","EEC","EGG","EJS","EME","EMR","EMS","ENG",
  "ENH","ENL","ENM","ENP","ENT","ENV","EPI","EPP","EPS","ERS","ESM","ESP","EST",
  "ETX","EVE","EVH","EXB","EXS","FAH","FAP","FMS","FOR","FPS","FRE","FRS","FSE",
  "FSM","FST","GAS","GDB","GEL","GEO","GER","GGG","GLO","GMD","GRD","GRK","GSW",
  "HDE","HEB","HIN","HIS","HMR","HND","HNR","HON","HPH","HPS","HRT","HUM","HUN",
  "HYD","IAD","ICL","IDI","IMD","IMM","IPM","IRE","IST","ITA","JPN","JST","LAH",
  "LAT","LAW","LDA","LED","LFA","LIN","LTS","MAE","MAT","MCB","MCN","MCP","MDD",
  "MDH","MDI","MDS","MGB","MGP","MGT","MGV","MHI","MIB","MIC","MMG","MMI","MPH",
  "MPM","MPS","MSA","MSC","MST","MUS","NAC","NAS","NCM","NEM","NEP","NEU","NGG",
  "NPB","NRS","NSC","NSU","NUB","NUT","OBG","OEH","OPT","OSU","OTO","PAS","PBG",
  "PBI","PED","PER","PFS","PGG","PHA","PHE","PHI","PHR","PHY","PLB","PLP","PLS",
  "PMD","PMI","PMR","POL","POM","POR","PPP","PSC","PSU","PSY","PTX","PUL","PUN",
  "RAL","RDI","REG","REL","RMT","RNU","RON","RST","RUS","SAF","SAS","SOC","SPA",
  "SPH","SSB","SSC","STA","STH","STP","STS","SUR","TAE","TCS","TRK","TTP","TXC",
  "UHP","URD","URO","UWP","VCR","VEN","VET","VMB","VMD","VME","VSR","WFB","WFC",
  "WLD","WMS","WRE",
];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function randomDelay(): number {
  return BASE_DELAY_MS + Math.random() * (MAX_DELAY_MS - BASE_DELAY_MS);
}

// ---------------------------------------------------------------------------
// Parsing helpers
// ---------------------------------------------------------------------------

function parseTime(raw: string): string {
  const match = raw.trim().match(/(\d{1,2}):?(\d{2})\s*([AP]M)/i);
  if (!match) return raw.trim();
  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && hour !== 12) hour += 12;
  if (ampm === "AM" && hour === 12) hour = 0;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function parseDays(raw: string): string[] {
  const text = raw.replace(/\s+/g, "");
  const result: string[] = [];
  if (/Th/i.test(text)) result.push("Th");
  if (/Tu/i.test(text)) result.push("Tu");
  const stripped = text.replace(/Th/gi, "").replace(/Tu/gi, "");
  if (stripped.includes("M")) result.push("M");
  if (stripped.includes("T")) result.push("Tu");
  if (stripped.includes("W")) result.push("W");
  if (stripped.includes("R")) result.push("Th");
  if (stripped.includes("F")) result.push("F");
  if (/Sa/i.test(text)) result.push("Sa");
  if (/Su/i.test(text)) result.push("Su");
  return [...new Set(result)];
}

function parseMeetingsFromTimeDays(timeDaysText: string, location: string): SectionMeeting[] {
  const text = timeDaysText.trim();
  if (!text || text.toLowerCase().includes("tba")) {
    return [{ days: [], startTime: "", endTime: "", location: location || "TBA" }];
  }

  const match = text.match(
    /(\d{1,2}):?(\d{2})\s*-\s*(\d{1,2}):?(\d{2})\s*([AP]M)\s*,?\s*([A-Za-z]+)/i
  );
  if (match) {
    const [, sh, sm, eh, em, ampm, dayStr] = match;
    let startHour = parseInt(sh!, 10);
    let endHour = parseInt(eh!, 10);
    const startMin = parseInt(sm!, 10);
    const endMin = parseInt(em!, 10);
    if (ampm.toUpperCase() === "PM") {
      if (endHour !== 12) endHour += 12;
      if (startHour !== 12 && startHour < endHour - 12) startHour += 12;
    } else {
      if (startHour === 12) startHour = 0;
      if (endHour === 12) endHour = 0;
    }
    return [{
      days: parseDays(dayStr!),
      startTime: `${startHour.toString().padStart(2, "0")}:${startMin.toString().padStart(2, "0")}`,
      endTime: `${endHour.toString().padStart(2, "0")}:${endMin.toString().padStart(2, "0")}`,
      location: location || "TBA",
    }];
  }

  const alt = text.match(/([A-Za-z]+)\s+(\d{1,2}:?\d{2}\s*[AP]M)\s*-\s*(\d{1,2}:?\d{2}\s*[AP]M)/i);
  if (alt) {
    return [{
      days: parseDays(alt[1]),
      startTime: parseTime(alt[2]),
      endTime: parseTime(alt[3]),
      location: location || "TBA",
    }];
  }

  return [{ days: [], startTime: "", endTime: "", location: location || "TBA" }];
}

function inferModality(location: string): "in-person" | "online" | "hybrid" {
  const lower = location.toLowerCase();
  if (lower.includes("remote") || lower.includes("online")) return "online";
  if (lower.includes("hybrid")) return "hybrid";
  return "in-person";
}

// ---------------------------------------------------------------------------
// HTML parser for course_search_results.cfm
// ---------------------------------------------------------------------------

function parseSectionsFromHtml(subject: string, html: string): Section[] {
  const $ = cheerio.load(html);
  const sections: Section[] = [];

  let table = $("#mc_win");
  if (!table.length) {
    table = $("table").filter((_, el) => {
      const caption = $(el).find("caption").text();
      return caption.includes("Search Results") || $(el).find("th strong").length > 0;
    }).first();
  }
  if (!table.length) return sections;

  const rows = table.find("tr").toArray();
  for (const row of rows) {
    const $row = $(row);
    const th = $row.find("th").first();
    const tds = $row.find("td").toArray();
    if (tds.length < 4) continue;

    let crn = th.length ? th.find("strong").first().text().trim() : "";
    if (!crn && th.length) {
      const crnMatch = th.text().match(/\b(\d{5})\b/);
      if (crnMatch) crn = crnMatch[1];
    }
    const timeDaysText = th.length ? th.find("em").first().text().trim() : "";
    const courseCell = $(tds[0]).text().trim();
    const sectionSeatsCell = $(tds[1]).text().trim();
    const title = $(tds[2]).text().trim();
    const instructorCell = $(tds[3]).text().trim();

    if (!crn) continue;
    if (!courseCell && !sectionSeatsCell) continue;

    const courseMatch =
      courseCell.match(/^([A-Z]{2,5})\s+(\d+\w*)/i) ??
      courseCell.match(/^([A-Z]{2,5})\s+(\S+)/i);
    const subj = (courseMatch?.[1] ?? subject).toUpperCase();
    const number = (courseMatch?.[2] ?? "").trim();
    const sectionIdMatch = sectionSeatsCell.match(/^(\d+\w*)/);
    const sectionId = sectionIdMatch?.[1] ?? "";

    let seatsTotal: number | null = null;
    let seatsAvailable: number | null = null;
    const seatsMatch = sectionSeatsCell.match(/(\d+)\s*\/\s*(\d+)/);
    if (seatsMatch) {
      seatsAvailable = parseInt(seatsMatch[1], 10);
      seatsTotal = parseInt(seatsMatch[2], 10);
    }

    const instructor = instructorCell.replace(/\s*\d+\.?\d*\s*$/, "").trim();
    const unitsMatch = instructorCell.match(/(\d+\.?\d*)\s*$/);
    const units = unitsMatch ? unitsMatch[1] : "";

    const meetings = parseMeetingsFromTimeDays(timeDaysText, "TBA");
    const modality = inferModality("TBA");

    sections.push({
      term: TERM_LABEL,
      subject: subj,
      courseNumber: number,
      courseCode: `${subj} ${number}`.trim(),
      title: title.replace(/\s+/g, " ").trim(),
      crn,
      section: sectionId,
      units,
      meetings,
      instructors: instructor ? [instructor] : [],
      modality,
      seatsTotal,
      seatsAvailable,
      waitlistTotal: null,
      waitlistAvailable: null,
      notes: [],
    });
  }
  return sections;
}

// ---------------------------------------------------------------------------
// Fetch helpers with rate-limit detection
// ---------------------------------------------------------------------------

let sessionCookies: string[] = [];

async function refreshSession(): Promise<void> {
  try {
    const res = await fetch(CLASS_SEARCH_INDEX_URL, {
      method: "GET",
      headers: {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    const setCookies = res.headers.getSetCookie?.() ?? [];
    if (setCookies.length > 0) {
      sessionCookies = setCookies.map((c) => c.split(";")[0]);
      console.log(`  Session: ${sessionCookies.length} cookies set`);
    }
  } catch (e) {
    console.warn("  Could not refresh session:", (e as Error).message);
  }
}

function isRateLimited(html: string): boolean {
  return html.includes("Over Use") || html.includes("more often than is normally expected");
}

async function fetchSubjectHtml(subject: string): Promise<string> {
  const body =
    `termCode=${TERM_CODE}&course_number=&multiCourse=&course_title=&instructor=` +
    `&subject=${subject}` +
    `&course_start_eval=-&course_start_time=-&course_end_eval=-&course_end_time=-` +
    `&course_status=all&course_level=-&course_units=-` +
    `&virtual=&G3AH=&G3SE=&G3SS=&G3CGH=&G3DD=&G3O=&G3Q=&G3S=&G3V=&G3WC=&G3W=` +
    `&runMe=1&clearMe=&reorder=&gettingResults=0`;

  let backoff = RATE_LIMIT_BACKOFF_MS;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml",
        Referer: CLASS_SEARCH_INDEX_URL,
        Origin: "https://registrar-apps.ucdavis.edu",
      };
      if (sessionCookies.length > 0) {
        headers.Cookie = sessionCookies.join("; ");
      }

      const resp = await fetch(CLASS_SEARCH_RESULTS_URL, {
        method: "POST",
        headers,
        body,
        redirect: "follow",
      });

      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const html = await resp.text();

      if (isRateLimited(html)) {
        console.warn(`  ⚠ Rate limited on attempt ${attempt}. Backing off ${backoff / 1000}s...`);
        await sleep(backoff);
        backoff = Math.min(backoff * 2, 300_000);
        await refreshSession();
        continue;
      }

      return html;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`  Attempt ${attempt} failed: ${msg}`);
      if (attempt < MAX_RETRIES) {
        await sleep(backoff);
        backoff *= 2;
      }
    }
  }
  throw new Error(`Failed after ${MAX_RETRIES} attempts for ${subject}`);
}

// ---------------------------------------------------------------------------
// Subject code fetchers
// ---------------------------------------------------------------------------

async function fetchSubjectCodesFromRegistrar(): Promise<string[]> {
  const res = await fetch(CLASS_SEARCH_INDEX_URL, {
    method: "GET",
    headers: { "User-Agent": BROWSER_UA, Accept: "text/html" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const $ = cheerio.load(html);
  const codes: string[] = [];
  $('select[name="subject"] option').each((_, el) => {
    const val = $(el).attr("value")?.trim();
    if (val && val.length >= 2 && val.length <= 5 && val !== "Y") {
      codes.push(val);
    }
  });
  return [...new Set(codes)];
}

async function fetchSubjectCodesFromCatalog(): Promise<string[]> {
  const res = await fetch("https://catalog.ucdavis.edu/course-search/", {
    headers: { "User-Agent": BROWSER_UA },
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const codes: string[] = [];
  $("select option").each((_, el) => {
    const val = $(el).attr("value")?.trim();
    if (val && /^[A-Z]{2,5}$/.test(val)) {
      codes.push(val);
    }
  });
  return [...new Set(codes)];
}

async function getSubjectCodes(): Promise<string[]> {
  try {
    console.log("Fetching subject list from registrar...");
    const codes = await fetchSubjectCodesFromRegistrar();
    if (codes.length > 50) {
      console.log(`  → ${codes.length} subjects from registrar`);
      return codes;
    }
  } catch (e) {
    console.warn("  Registrar subject list failed:", (e as Error).message);
  }

  try {
    console.log("Fetching subject list from catalog...");
    const codes = await fetchSubjectCodesFromCatalog();
    if (codes.length > 50) {
      console.log(`  → ${codes.length} subjects from catalog`);
      return codes;
    }
  } catch (e) {
    console.warn("  Catalog subject list failed:", (e as Error).message);
  }

  console.log(`  Using fallback list (${FALLBACK_SUBJECTS.length} subjects)`);
  return FALLBACK_SUBJECTS;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Load existing data for resume/merge
  let existingSections: Section[] = [];
  const existingSubjects = new Set<string>();
  if (fs.existsSync(OUT_PATH)) {
    try {
      existingSections = JSON.parse(fs.readFileSync(OUT_PATH, "utf-8"));
      for (const s of existingSections) existingSubjects.add(s.subject);
      console.log(
        `Loaded ${existingSections.length} existing sections ` +
        `(${existingSubjects.size} subjects). Will merge new data.`
      );
    } catch {
      console.log("No valid existing data; starting fresh.");
    }
  }

  const subjectCodes = await getSubjectCodes();

  // Establish session before scraping
  console.log("Establishing session...");
  await refreshSession();
  await sleep(2000);

  const allNewSections: Section[] = [];
  const failedSubjects: string[] = [];
  const skippedSubjects: string[] = [];
  let consecutiveEmpty = 0;
  let rateLimitHits = 0;

  for (let i = 0; i < subjectCodes.length; i++) {
    const subject = subjectCodes[i];
    const progress = `[${i + 1}/${subjectCodes.length}]`;

    // If we already have data for this subject from a prior run, skip it
    if (existingSubjects.has(subject)) {
      skippedSubjects.push(subject);
      continue;
    }

    try {
      console.log(`${progress} ${subject}...`);
      const html = await fetchSubjectHtml(subject);

      if (isRateLimited(html)) {
        console.error(`  ✗ Still rate limited after retries. Saving progress and stopping.`);
        rateLimitHits++;
        if (rateLimitHits >= 3) {
          console.error("Too many rate-limit blocks. Saving and exiting.");
          break;
        }
        failedSubjects.push(subject);
        await sleep(RATE_LIMIT_BACKOFF_MS * 2);
        continue;
      }

      const sections = parseSectionsFromHtml(subject, html);
      console.log(`  → ${sections.length} sections`);
      allNewSections.push(...sections);

      if (sections.length === 0) {
        consecutiveEmpty++;
      } else {
        consecutiveEmpty = 0;
      }

      // Incremental save every 20 subjects
      if ((i + 1) % 20 === 0) {
        saveProgress(existingSections, allNewSections);
      }

      // Randomized delay
      const delay = randomDelay();
      await sleep(delay);
    } catch (err) {
      console.error(`  ✗ ${subject}: ${(err as Error).message}`);
      failedSubjects.push(subject);
    }
  }

  saveProgress(existingSections, allNewSections);

  console.log("\n--- Summary ---");
  if (skippedSubjects.length) {
    console.log(`Skipped (already had data): ${skippedSubjects.length} subjects`);
  }
  if (failedSubjects.length) {
    console.warn(`Failed: ${failedSubjects.join(", ")}`);
  }
  const total = JSON.parse(fs.readFileSync(OUT_PATH, "utf-8")).length;
  console.log(`Dataset: ${total} sections in ${path.relative(process.cwd(), OUT_PATH)}`);
  if (total < 500) {
    console.log(
      "\nTip: Section count is low. The registrar may have rate-limited this IP.\n" +
      "Wait 1-2 hours and re-run. The scraper will resume from where it left off\n" +
      "(already-fetched subjects are kept)."
    );
  }
}

function saveProgress(existing: Section[], newSections: Section[]) {
  const byKey = new Map<string, Section>();
  for (const s of [...existing, ...newSections]) {
    const key = `${s.term}-${s.crn}`;
    const prev = byKey.get(key);
    if (prev) {
      const existingMeetingKeys = new Set(prev.meetings.map((m) => JSON.stringify(m)));
      for (const m of s.meetings) {
        if (!existingMeetingKeys.has(JSON.stringify(m))) prev.meetings.push(m);
      }
    } else {
      byKey.set(key, { ...s, meetings: [...s.meetings] });
    }
  }
  const deduped = Array.from(byKey.values());
  fs.writeFileSync(OUT_PATH, JSON.stringify(deduped, null, 2));
  console.log(`  [saved ${deduped.length} sections]`);
}

main().catch((err) => {
  console.error("Scrape failed:", err);
  process.exit(1);
});
