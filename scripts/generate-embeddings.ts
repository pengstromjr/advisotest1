import fs from "fs";
import path from "path";
import OpenAI from "openai";
import type {
  Course,
  ScrapedProgram,
  GERequirements,
  EmbeddingEntry,
} from "../lib/course-data";

const envPath = path.join(__dirname, "..", ".env.local");
const envLine = fs
  .readFileSync(envPath, "utf-8")
  .split("\n")
  .find((l) => l.startsWith("OPENAI_API_KEY="));
const apiKey = envLine?.split("=").slice(1).join("=").trim();
if (!apiKey) throw new Error("OPENAI_API_KEY not found in .env.local");

const client = new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1" });
const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMS = 256;
const BATCH_SIZE = 100;
const DATA_DIR = path.join(__dirname, "..", "data");

interface TextChunk {
  id: string;
  text: string;
  type: EmbeddingEntry["metadata"]["type"];
  source: string;
}

function courseToText(course: Course): string {
  const prereqs =
    typeof course.prerequisites === "string"
      ? course.prerequisites || "None"
      : course.prerequisites.length > 0
        ? course.prerequisites.join(", ")
        : "None";
  const offered =
    Array.isArray(course.offered) && course.offered.length > 0
      ? course.offered.join(", ")
      : "Not specified";
  const ge =
    course.ge_areas.length > 0 ? course.ge_areas.join(", ") : "None";
  return [
    `Course: ${course.code} — ${course.title}`,
    `Units: ${course.units}`,
    `Description: ${course.description}`,
    `Prerequisites: ${prereqs}`,
    `Offered: ${offered}`,
    `GE Areas: ${ge}`,
  ].join("\n");
}

function scrapedProgramToChunks(
  prog: ScrapedProgram,
  filename: string
): TextChunk[] {
  const chunks: TextChunk[] = [];
  const base = filename.replace(".json", "");

  chunks.push({
    id: `${base}_overview`,
    text: [
      `Program: ${prog.name}`,
      `Degree Type: ${prog.degree_type}`,
      `Department: ${prog.department}`,
      prog.total_units ? `Total Units: ${prog.total_units}` : "",
      prog.description ? `Description: ${prog.description}` : "",
      prog.specializations.length > 0
        ? `Specializations: ${prog.specializations.join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n"),
    type: "program_overview",
    source: filename,
  });

  if (prog.requirements.length > 0) {
    const reqParts = [`Requirements for ${prog.name}:`];
    for (const section of prog.requirements) {
      reqParts.push(
        `${section.heading}${section.units ? ` (${section.units} units)` : ""}:`
      );
      if (section.courses.length > 0) {
        reqParts.push(`  Courses: ${section.courses.join(", ")}`);
      }
      for (const note of section.notes) {
        reqParts.push(`  Note: ${note}`);
      }
    }
    const reqText = reqParts.join("\n");
    const MAX_CHUNK = 2000;
    if (reqText.length > MAX_CHUNK) {
      for (let i = 0; i < prog.requirements.length; i += 3) {
        const slice = prog.requirements.slice(i, i + 3);
        const partial = [`Requirements for ${prog.name} (part ${Math.floor(i / 3) + 1}):`];
        for (const section of slice) {
          partial.push(
            `${section.heading}${section.units ? ` (${section.units} units)` : ""}:`
          );
          if (section.courses.length > 0) {
            partial.push(`  Courses: ${section.courses.join(", ")}`);
          }
          for (const note of section.notes) {
            partial.push(`  Note: ${note}`);
          }
        }
        chunks.push({
          id: `${base}_requirements_${Math.floor(i / 3)}`,
          text: partial.join("\n"),
          type: "program_requirements",
          source: filename,
        });
      }
    } else {
      chunks.push({
        id: `${base}_requirements`,
        text: reqText,
        type: "program_requirements",
        source: filename,
      });
    }
  }

  if (prog.advising_notes.length > 0) {
    chunks.push({
      id: `${base}_advising`,
      text: [
        `Advising notes for ${prog.name}:`,
        ...prog.advising_notes.map((n) => `- ${n}`),
      ].join("\n"),
      type: "program_advising",
      source: filename,
    });
  }

  return chunks;
}

function geToChunks(ge: GERequirements): TextChunk[] {
  const chunks: TextChunk[] = [];

  const overviewParts = [
    `UC Davis General Education Requirements (${ge.effective})`,
    `Total GE units: ${ge.total_units}`,
    "",
  ];

  for (const cat of ge.categories) {
    overviewParts.push(`${cat.name} (${cat.units_required} units):`);
    overviewParts.push(cat.description);
    for (const area of cat.areas) {
      const units =
        area.units_min && area.units_max
          ? `${area.units_min}-${area.units_max} units`
          : area.units_required
            ? `${area.units_required} units`
            : "";
      overviewParts.push(`  ${area.code} - ${area.name} (${units}): ${area.description}`);
    }
    overviewParts.push("");
  }

  for (const note of ge.notes) {
    overviewParts.push(`- ${note}`);
  }

  chunks.push({
    id: "ge_overview",
    text: overviewParts.join("\n"),
    type: "ge_requirement",
    source: "ge-requirements.json",
  });

  return chunks;
}

async function batchEmbed(texts: string[]): Promise<number[][]> {
  const all: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const response = await client.embeddings.create({
      model: EMBEDDING_MODEL,
      input: batch,
      dimensions: EMBEDDING_DIMS,
    });
    for (const item of response.data) {
      all.push(item.embedding);
    }
    if (i + BATCH_SIZE < texts.length) {
      process.stdout.write(
        `  Embedded ${Math.min(i + BATCH_SIZE, texts.length)}/${texts.length}\r`
      );
    }
  }
  console.log(`  Embedded ${texts.length}/${texts.length}`);
  return all;
}

async function main() {
  const allChunks: TextChunk[] = [];

  // 1. Load courses
  let coursesPath = path.join(DATA_DIR, "courses-full.json");
  if (!fs.existsSync(coursesPath)) {
    coursesPath = path.join(DATA_DIR, "courses.json");
  }
  const courses: Course[] = JSON.parse(
    fs.readFileSync(coursesPath, "utf-8")
  );
  console.log(`Loaded ${courses.length} courses`);

  for (const course of courses) {
    allChunks.push({
      id: `course_${course.code.replace(/\s+/g, "_")}`,
      text: courseToText(course),
      type: "course",
      source: path.basename(coursesPath),
    });
  }

  // 2. Load programs (scraped format)
  const majorsDir = path.join(DATA_DIR, "majors");
  if (fs.existsSync(majorsDir)) {
    const majorFiles = fs.readdirSync(majorsDir).filter((f) => f.endsWith(".json"));
    console.log(`Loaded ${majorFiles.length} programs`);

    for (const file of majorFiles) {
      const raw = fs.readFileSync(path.join(majorsDir, file), "utf-8");
      const data = JSON.parse(raw);

      if (data.url && data.degree_type) {
        const chunks = scrapedProgramToChunks(data as ScrapedProgram, file);
        allChunks.push(...chunks);
      } else if (data.name && data.preparation_courses) {
        // Legacy format — handle old-style major files
        const chunks = legacyMajorToChunks(data, file);
        allChunks.push(...chunks);
      }
    }
  }

  // 3. Load GE requirements
  const gePath = path.join(DATA_DIR, "ge-requirements.json");
  if (fs.existsSync(gePath)) {
    const ge: GERequirements = JSON.parse(
      fs.readFileSync(gePath, "utf-8")
    );
    const geChunks = geToChunks(ge);
    allChunks.push(...geChunks);
    console.log(`Added ${geChunks.length} GE chunks`);
  }

  console.log(`\nTotal chunks to embed: ${allChunks.length}`);
  console.log(`Embedding with ${EMBEDDING_MODEL} (${EMBEDDING_DIMS} dims)...`);

  const texts = allChunks.map((c) => c.text);
  const embeddings = await batchEmbed(texts);

  const entries: EmbeddingEntry[] = allChunks.map((chunk, i) => ({
    id: chunk.id,
    text: chunk.text,
    embedding: embeddings[i],
    metadata: {
      type: chunk.type,
      source: chunk.source,
    },
  }));

  const outPath = path.join(DATA_DIR, "embeddings.json");
  fs.writeFileSync(outPath, JSON.stringify(entries));
  const sizeMB = (fs.statSync(outPath).size / 1024 / 1024).toFixed(1);
  console.log(`\nWrote ${entries.length} entries to ${outPath} (${sizeMB} MB)`);
}

function legacyMajorToChunks(major: any, filename: string): TextChunk[] {
  const chunks: TextChunk[] = [];
  const base = filename.replace(".json", "");

  const prepCourses = (major.preparation_courses?.courses || [])
    .map((c: any) => (typeof c === "string" ? c : `${c.code} (${c.title})`))
    .join(", ");

  chunks.push({
    id: `${base}_overview`,
    text: [
      `Major: ${major.name}`,
      `Department: ${major.department}`,
      major.college ? `College: ${major.college}` : "",
      `Total units required: ${major.total_units_required}`,
      `GPA requirement: ${major.gpa_requirement}`,
      `Preparatory courses: ${prepCourses}`,
    ]
      .filter(Boolean)
      .join("\n"),
    type: "major_overview",
    source: filename,
  });

  const reqParts: string[] = [`Major requirements for ${major.name}:`];
  if (major.core_courses) {
    const cores = major.core_courses.courses
      .map((c: any) => `${c.code} (${c.title})`)
      .join(", ");
    reqParts.push(`Core courses: ${cores}`);
  }
  if (major.upper_division_required) {
    reqParts.push(
      `Required upper-division: ${major.upper_division_required.courses.join(", ")}`
    );
  }
  if (major.upper_division_electives) {
    reqParts.push(
      `Upper-division electives: Choose ${major.upper_division_electives.choose} from: ${major.upper_division_electives.from.join(", ")}`
    );
  }
  if (major.emphasis_areas) {
    for (const area of major.emphasis_areas) {
      reqParts.push(
        `Emphasis area "${area.name}": ${area.recommended.join(", ")}`
      );
    }
  }
  chunks.push({
    id: `${base}_requirements`,
    text: reqParts.join("\n"),
    type: "major_requirements",
    source: filename,
  });

  if (major.advising_notes?.length > 0) {
    chunks.push({
      id: `${base}_advising`,
      text: [
        `Advising notes for ${major.name}:`,
        ...major.advising_notes.map((n: string) => `- ${n}`),
      ].join("\n"),
      type: "major_advising",
      source: filename,
    });
  }

  return chunks;
}

main().catch((err) => {
  console.error("Error generating embeddings:", err);
  process.exit(1);
});
