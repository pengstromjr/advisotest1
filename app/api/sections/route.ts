import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import type { Section, Course } from "@/lib/course-data";
import { normalizeCourseCode, parseCourseCodeParts } from "@/lib/course-code";
import {
  CURRENT_GRADES_FILE,
  CURRENT_SECTIONS_FILE,
  CURRENT_TERM_LABEL,
} from "@/lib/current-term";

const SECTION_FILES: Record<string, string> = {
  [CURRENT_TERM_LABEL]: CURRENT_SECTIONS_FILE,
};

interface SectionRmpEntry {
  avgRating?: number;
  avgDifficulty?: number;
  numRatings?: number;
  wouldTakeAgainPercent?: number;
  legacyId?: string;
  grades?: {
    avgGpa?: number;
    distribution?: Record<string, number>;
  };
  [key: string]: unknown;
}

interface GradeEntry {
  overall_gpa?: number;
  overall_enrolled?: number;
  [key: string]: unknown;
}

type RmpMap = Record<string, SectionRmpEntry>;
type GradeMap = Record<string, GradeEntry>;

const cachedSectionsByFile = new Map<string, Section[]>();
let cachedCourseGe: Record<string, string[]> | null = null;
let cachedRmp: RmpMap | null = null;
let cachedGrades: GradeMap | null = null;

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function loadSectionsForTerm(term: string): Section[] {
  const dataDir = path.join(process.cwd(), "data");
  const fileName = SECTION_FILES[term] ?? CURRENT_SECTIONS_FILE;
  const cached = cachedSectionsByFile.get(fileName);
  if (cached) return cached;

  try {
    const sectionsRaw = fs.readFileSync(path.join(dataDir, "sections", fileName), "utf-8");
    const sections = JSON.parse(sectionsRaw) as Section[];
    if (process.env.NODE_ENV === "production") cachedSectionsByFile.set(fileName, sections);
    return sections;
  } catch {
    return [];
  }
}

function loadData(term = CURRENT_TERM_LABEL) {
  const dataDir = path.join(process.cwd(), "data");
  const sections = loadSectionsForTerm(term);

  // Load Course GE Data from BOTH files to maximize coverage
  let courseGe = cachedCourseGe;
  if (!courseGe) {
    try {
      const geMap: Record<string, string[]> = {};
      
      // Load base courses.json
      const coursesPath1 = path.join(dataDir, "courses.json");
      if (fs.existsSync(coursesPath1)) {
        const c1 = JSON.parse(fs.readFileSync(coursesPath1, "utf-8")) as Course[];
        for (const c of c1) {
          if (c.ge_areas) {
            const code = normalizeCourseCode(c.code);
            geMap[code] = [...(geMap[code] || []), ...c.ge_areas];
          }
        }
      }

      // Load richer courses-full.json
      const coursesPath2 = path.join(dataDir, "courses-full.json");
      if (fs.existsSync(coursesPath2)) {
         const c2 = JSON.parse(fs.readFileSync(coursesPath2, "utf-8")) as Course[];
         for (const c of c2) {
           if (c.ge_areas) {
             const code = normalizeCourseCode(c.code);
             geMap[code] = [...(geMap[code] || []), ...c.ge_areas];
           }
         }
      }

      // Deduplicate arrays
      for (const key in geMap) {
        geMap[key] = Array.from(new Set(geMap[key]));
      }

      courseGe = geMap;
      if (process.env.NODE_ENV === "production") cachedCourseGe = courseGe;
    } catch (e) {
      console.error("Failed to load course geometries", e);
      courseGe = {};
    }
  }

  // Load current-term instructor data. The site should only surface current-term
  // section/recommendation context unless this current-term file is changed.
  let rmp = cachedRmp;
  if (!rmp) {
    try {
      const rmpRaw = fs.readFileSync(path.join(dataDir, "rmp.json"), "utf-8");
      rmp = JSON.parse(rmpRaw);
      if (process.env.NODE_ENV === "production") cachedRmp = rmp;
    } catch {
      rmp = {};
    }
  }

  // Load Grades Data (CattleLog)
  let grades = cachedGrades;
  if (!grades) {
    try {
      const gradesRaw = fs.readFileSync(path.join(dataDir, CURRENT_GRADES_FILE), "utf-8");
      grades = JSON.parse(gradesRaw);
      if (process.env.NODE_ENV === "production") cachedGrades = grades;
    } catch {
      grades = {};
    }
  }

  return { 
    sections, 
    courseGe: courseGe as Record<string, string[]>, 
    rmp: rmp as RmpMap,
    grades: grades as GradeMap
  };
}

function parseTime(timeStr: string): number {
  if (!timeStr) return -1;
  const [h, m] = timeStr.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const term = url.searchParams.get("term") ?? "";
  const query = url.searchParams.get("q")?.trim().toUpperCase() ?? "";
  const crn = url.searchParams.get("crn")?.trim() ?? "";
  const subjectParams = url.searchParams.getAll("subject").map(s => s.trim().toUpperCase()).filter(Boolean);
  const openOnly = url.searchParams.get("open") === "true";
  
  // Advanced filters
  const levelParams = url.searchParams.getAll("level"); // e.g. "Lower" "Upper" "Grad"
  const unitsParam = url.searchParams.get("units"); // e.g. "4", "5+"
  const geParams = url.searchParams.get("ge")?.split(",").filter(Boolean) || []; // e.g. "AH,WE"
  const geMatch = url.searchParams.get("geMatch") || "any"; // "any" = course has at least one of the GEs; "all" = course has all
  const daysParams = url.searchParams.get("days")?.split(",").filter(Boolean) || []; // e.g. "M,W,F"
  const timeStart = parseTime(url.searchParams.get("startTime") || "");
  const timeEnd = parseTime(url.searchParams.get("endTime") || "");

  // Numerical metrics filters
  const minRating = parseFloat(url.searchParams.get("minRating") || "0");
  const maxRating = parseFloat(url.searchParams.get("maxRating") || "5");
  const minGpa = parseFloat(url.searchParams.get("minGpa") || "0");
  const maxGpa = parseFloat(url.searchParams.get("maxGpa") || "4");
  const minDifficulty = parseFloat(url.searchParams.get("minDifficulty") || "0");
  const maxDifficulty = parseFloat(url.searchParams.get("maxDifficulty") || "5");
  const maxRatings = parseInt(url.searchParams.get("maxRatings") || "999999", 10);
  const sortBy = url.searchParams.get("sortBy") || ""; // rating, gpa, difficulty, geCount

  const { sections, courseGe, rmp, grades } = loadData(CURRENT_TERM_LABEL);

  let filtered = sections;

  if (term) {
    filtered = filtered.filter((s) => s.term === CURRENT_TERM_LABEL);
  }

  if (subjectParams.length > 0) {
    filtered = filtered.filter((s) => subjectParams.includes(s.subject.toUpperCase()));
  }

  if (crn) {
    filtered = filtered.filter((s) => s.crn === crn);
  }

  // --- Apply Advanced Filters First ---
  
  if (levelParams.length > 0 && !levelParams.includes("All")) {
    filtered = filtered.filter((s) => {
      const numMatch = s.courseNumber.match(/^(\d+)/);
      if (!numMatch) return false;
      const num = parseInt(numMatch[1], 10);
      
      if (levelParams.includes("Lower") && num >= 1 && num <= 99) return true;
      if (levelParams.includes("Upper") && num >= 100 && num <= 199) return true;
      if (levelParams.includes("Grad") && num >= 200) return true;
      return false;
    });
  }

  if (unitsParam && unitsParam !== "All") {
    filtered = filtered.filter((s) => {
      const uMatch = String(s.units).match(/^(\d+)/);
      if (!uMatch) return false;
      const u = parseInt(uMatch[1], 10);
      if (unitsParam === "5+") return u >= 5;
      return String(u) === unitsParam;
    });
  }

  if (geParams.length > 0) {
    filtered = filtered.filter((s) => {
      const code = normalizeCourseCode(s.courseCode);
      const courseGeAreas = Array.from(
        new Set([...(courseGe[code] || []), ...(s.geAreas || [])])
      );
      if (geMatch === "all") {
        return geParams.every((ge) => courseGeAreas.includes(ge));
      }
      // Default: "any" — course satisfies at least one of the requested GE areas
      return geParams.some((ge) => courseGeAreas.includes(ge));
    });
  }

  if (daysParams.length > 0) {
    filtered = filtered.filter((s) => {
      return daysParams.every(day => 
        s.meetings.some(m => m.days && m.days.includes(day))
      );
    });
  }

  if (timeStart >= 0 || timeEnd >= 0) {
    filtered = filtered.filter((s) => {
      if (!s.meetings || s.meetings.length === 0) return false;
      return s.meetings.every(m => {
        if (!m.startTime || !m.endTime) return false;
        const ms = parseTime(m.startTime);
        const me = parseTime(m.endTime);
        const startOk = timeStart < 0 || ms >= timeStart;
        const endOk = timeEnd < 0 || me <= timeEnd;
        return startOk && endOk;
      });
    });
  }

  if (openOnly) {
    filtered = filtered.filter((s) => {
      if (s.seatsAvailable != null) return s.seatsAvailable > 0;
      // If seat data is unavailable (null), assume open for catalog-derived sections.
      if (s.seatsTotal == null) return true;
      return true;
    });
  }

  // --- Numerical Metrics Filtering ---
  // Only apply RMP filters to sections that HAVE RMP data.
  // Sections without RMP still pass through but get sorted lower.
  const hasRmpFilters = minRating > 0 || minGpa > 0 || minDifficulty > 0 || maxDifficulty < 5 || maxRatings < 999999;
  if (hasRmpFilters) {
    filtered = filtered.filter(s => {
      const inst = s.instructors?.[0];
      const data = inst ? rmp[inst] : null;
      if (!data) return false; // Only exclude no-RMP sections when RMP filters are active

      const rating = data.avgRating || 0;
      const courseGrades = grades[s.courseCode];
      const gpa = courseGrades?.overall_gpa || data.grades?.avgGpa || 0;
      const difficulty = data.avgDifficulty || 0;
      const ratingCount = data.numRatings || 0;

      if (rating < minRating || rating > maxRating) return false;
      if (gpa < minGpa || (maxGpa < 4 && gpa > maxGpa)) return false;
      if (difficulty < minDifficulty || difficulty > maxDifficulty) return false;
      if (ratingCount > maxRatings) return false;

      return true;
    });
  }

  // --- Apply Text Search ---
  let isExactCourseCodeQuery = false;
  if (query) {
    const q = query.toUpperCase();
    const parsedCourseQuery = parseCourseCodeParts(q);
    const exactCourseQuery =
      parsedCourseQuery && /^[A-Z]{2,12}\s*\d{1,3}(?:\s*[A-Z]{1,2})?$/.test(q);
    isExactCourseCodeQuery = Boolean(exactCourseQuery);
    const normalizedCourseQuery = parsedCourseQuery?.code ?? normalizeCourseCode(q);
    const looksLikeSubjectOrCode = /^[A-Z]{2,12}(\s*\d.*)?$/.test(q) || /^[A-Z]{2,12}\s*\d/.test(q);
    const titleWordRe = q.length >= 4 ? new RegExp(`\\b${escapeRegExp(q)}\\b`, "i") : null;

    filtered = filtered.filter(s => {
      const subj = s.subject.toUpperCase();
      const code = `${subj} ${s.courseNumber}`.toUpperCase();
      const unpaddedCode = `${subj} ${s.courseNumber.replace(/^0+/, "")}`.toUpperCase();
      const normalizedCode = normalizeCourseCode(s.courseCode || code);
      const title = s.title.toUpperCase();
      const instructors = s.instructors.map((i) => i.toUpperCase());

      const subjectExact = subj === q;
      const codePrefix = exactCourseQuery
        ? normalizedCode === normalizedCourseQuery
        : code.startsWith(q) ||
          unpaddedCode.startsWith(q) ||
          normalizedCode.startsWith(normalizedCourseQuery);
      const subjectPrefix = q.length >= 2 && q.length <= 5 && subj.startsWith(q);
      const codeContains = exactCourseQuery
        ? false
        : code.includes(q) ||
          unpaddedCode.includes(q) ||
          normalizedCode.includes(normalizedCourseQuery);
      const titleWord = titleWordRe ? titleWordRe.test(s.title) : false;
      const titleContains = q.length >= 4 ? title.includes(q) : false;
      const instructorContains = q.length >= 3 ? instructors.some((i) => i.includes(q)) : false;

      const matches = subjectExact || codePrefix || subjectPrefix || codeContains || titleWord || titleContains || instructorContains;
      if (!matches) return false;

      if (looksLikeSubjectOrCode) {
        return subjectExact || codePrefix || subjectPrefix || codeContains;
      }
      return true;
    });
  }

  // --- Sorting Logic ---
  if (sortBy) {
    filtered.sort((a, b) => {
      const rmpA = rmp[a.instructors[0]] || {};
      const rmpB = rmp[b.instructors[0]] || {};

      if (sortBy === "rating") {
        // Weighted Sort: Rating * log(number of reviews)
        const scoreA = (rmpA.avgRating || 0) * Math.log10((rmpA.numRatings || 1) + 1);
        const scoreB = (rmpB.avgRating || 0) * Math.log10((rmpB.numRatings || 1) + 1);
        return scoreB - scoreA;
      }

      if (sortBy === "gpa") {
        // Sort by GPA, then by number of GEs covered
        const gpaA = grades[a.courseCode]?.overall_gpa || rmpA.grades?.avgGpa || 0;
        const gpaB = grades[b.courseCode]?.overall_gpa || rmpB.grades?.avgGpa || 0;
        if (gpaB !== gpaA) return gpaB - gpaA;
        
        const geA = (courseGe[normalizeCourseCode(a.courseCode)] || []).length;
        const geB = (courseGe[normalizeCourseCode(b.courseCode)] || []).length;
        return geB - geA;
      }

      if (sortBy === "difficulty") {
        return (rmpA.avgDifficulty || 0) - (rmpB.avgDifficulty || 0);
      }

      if (sortBy === "geCount") {
        return (courseGe[normalizeCourseCode(b.courseCode)] || []).length -
          (courseGe[normalizeCourseCode(a.courseCode)] || []).length;
      }

      return 0;
    });
  } else if (!query) {
    // Default: Sort by popularity/rating if no query
    filtered.sort((a, b) => {
      const rmpA = rmp[a.instructors[0]] || { numRatings: 0 };
      const rmpB = rmp[b.instructors[0]] || { numRatings: 0 };
      return (rmpB.numRatings || 0) - (rmpA.numRatings || 0);
    });
  }

  // --- Apply Instructor Variety (Max 3 per instructor in top results) ---
  const instructorCounts: Record<string, number> = {};
  const varietySections: Section[] = [];
  
  if (isExactCourseCodeQuery || crn) {
    varietySections.push(...filtered);
  } else {
    for (const s of filtered) {
      const inst = s.instructors[0] || "Unknown";
      const count = instructorCounts[inst] || 0;
      if (count < 3) {
        varietySections.push(s);
        instructorCounts[inst] = count + 1;
      }
    }
  }

  const total = filtered.length;
  const limit = Math.min(Math.max(1, parseInt(url.searchParams.get("limit") ?? "100", 10) || 100), 200);
  const offset = Math.max(0, parseInt(url.searchParams.get("offset") ?? "0", 10) || 0);
  
  const sectionsPage = varietySections.slice(offset, offset + limit).map(s => {
    const sectionRmp: RmpMap = {};
    for (const inst of (s.instructors || [])) {
      if (rmp[inst]) {
        // Enrich RMP with CattleLog grade data for backward compatibility
        const instRmp = { ...rmp[inst] };
        const courseGrades = grades[s.courseCode];
        if (courseGrades?.overall_gpa != null) {
          instRmp.grades = {
            avgGpa: courseGrades.overall_gpa,
            distribution: instRmp.grades?.distribution || {},
          };
        }
        sectionRmp[inst] = instRmp;
      }
    }
    return { ...s, rmp: sectionRmp };
  });

  return NextResponse.json({
    total,
    limit,
    offset,
    count: sectionsPage.length,
    sections: sectionsPage,
  });
}
