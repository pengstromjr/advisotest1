import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import type {
  ScrapedProgram,
  RequirementSection,
  Course,
  GERequirements,
} from "@/lib/course-data";

interface GECourseInfo {
  ge_areas: string[];
  units: number | string;
}

interface ProgramResponse {
  requirements: RequirementSection[];
  ge: {
    categories: GERequirements["categories"];
    notes: string[];
    courseGeMap: Record<string, GECourseInfo>;
  };
}

const programCache = new Map<string, RequirementSection[]>();
let geCache: ProgramResponse["ge"] | null = null;

function loadGeData(): ProgramResponse["ge"] {
  if (geCache) return geCache;

  const dataDir = path.join(process.cwd(), "data");

  const geRaw = fs.readFileSync(
    path.join(dataDir, "ge-requirements.json"),
    "utf-8"
  );
  const geReqs: GERequirements = JSON.parse(geRaw);

  let coursesPath = path.join(dataDir, "courses-full.json");
  if (!fs.existsSync(coursesPath)) {
    coursesPath = path.join(dataDir, "courses.json");
  }
  const coursesRaw = fs.readFileSync(coursesPath, "utf-8");
  const courses: Course[] = JSON.parse(coursesRaw);

  const courseGeMap: Record<string, GECourseInfo> = {};
  for (const c of courses) {
    if (c.ge_areas && c.ge_areas.length > 0) {
      courseGeMap[c.code] = { ge_areas: c.ge_areas, units: c.units };
    }
  }

  geCache = {
    categories: geReqs.categories,
    notes: geReqs.notes,
    courseGeMap,
  };
  return geCache;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const name = searchParams.get("name");

  if (!name) {
    return NextResponse.json(
      { error: "Missing 'name' query parameter" },
      { status: 400 }
    );
  }

  let requirements: RequirementSection[];

  if (programCache.has(name)) {
    requirements = programCache.get(name)!;
  } else {
    requirements = [];
    const majorsDir = path.join(process.cwd(), "data", "majors");
    try {
      const files = fs
        .readdirSync(majorsDir)
        .filter((f) => f.endsWith(".json"));
      for (const file of files) {
        const raw = fs.readFileSync(path.join(majorsDir, file), "utf-8");
        const data: ScrapedProgram = JSON.parse(raw);
        if (data.name === name) {
          requirements = data.requirements;
          break;
        }
      }
    } catch {
      return NextResponse.json(
        { error: "Failed to read program data" },
        { status: 500 }
      );
    }
    programCache.set(name, requirements);
  }

  let ge: ProgramResponse["ge"];
  try {
    ge = loadGeData();
  } catch {
    ge = { categories: [], notes: [], courseGeMap: {} };
  }

  const response: ProgramResponse = { requirements, ge };
  return NextResponse.json(response);
}
