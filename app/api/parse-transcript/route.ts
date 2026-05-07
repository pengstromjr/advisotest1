import { NextResponse } from "next/server";
import { normalizeCourseCode } from "@/lib/course-code";
import { extractCourseMentions } from "@/lib/course-lookup";

interface UploadedTranscriptFile {
  name: string;
  type: string;
  data: string;
}

interface OpenAIContentPart {
  type: "input_text" | "input_image" | "input_file";
  text?: string;
  image_url?: string;
  detail?: "low" | "high" | "auto";
  filename?: string;
  file_data?: string;
}

function extractJsonText(response: any): string {
  if (typeof response?.output_text === "string") return response.output_text;
  const output = response?.output;
  if (!Array.isArray(output)) return "";
  for (const item of output) {
    const content = item?.content;
    if (!Array.isArray(content)) continue;
    for (const part of content) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        return part.text;
      }
    }
  }
  return "";
}

function parseCourseCodesFromAi(text: string): string[] {
  try {
    const jsonStart = text.indexOf("{");
    const jsonEnd = text.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return [];
    const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    if (!Array.isArray(parsed?.completed_courses)) return [];
    return parsed.completed_courses
      .map((course: any) => course?.code)
      .filter((code: unknown): code is string => typeof code === "string");
  } catch {
    return [];
  }
}

async function scanTranscriptFiles(files: UploadedTranscriptFile[], transcriptText: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("File transcript scanning needs an OpenAI API key. You can still paste transcript text.");
  }

  const content: OpenAIContentPart[] = [
    {
      type: "input_text",
      text:
        "You are reading an unofficial college transcript for Adviso. Extract only courses the student has completed or earned credit for. Include passed letter grades, P/NP passes, CR, S, AP/IB/transfer credit when a course equivalent is shown. Exclude planned, enrolled, in-progress, dropped, withdrawn, failed, no-pass, and waitlisted courses. Return strict JSON only in this shape: {\"completed_courses\":[{\"code\":\"MAT 021A\",\"evidence\":\"short evidence\"}],\"notes\":\"short note\"}. Use UC Davis-style subject and three-digit course numbers when visible. If uncertain, omit it.",
    },
  ];

  if (transcriptText.trim()) {
    content.push({
      type: "input_text",
      text: `Pasted transcript text:\n${transcriptText.slice(0, 16000)}`,
    });
  }

  for (const file of files) {
    const type = file.type || "application/octet-stream";
    if (type.startsWith("image/")) {
      content.push({
        type: "input_image",
        image_url: `data:${type};base64,${file.data}`,
        detail: "high",
      });
    } else if (type === "application/pdf") {
      content.push({
        type: "input_file",
        filename: file.name || "transcript.pdf",
        file_data: `data:application/pdf;base64,${file.data}`,
      });
    }
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      input: [
        {
          role: "user",
          content,
        },
      ],
      temperature: 0,
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => "");
    throw new Error(message || "AI transcript scan failed");
  }

  const data = await response.json();
  const jsonText = extractJsonText(data);
  return parseCourseCodesFromAi(jsonText);
}

export async function POST(req: Request) {
  try {
    const { transcript, files = [] } = (await req.json()) as {
      transcript?: string;
      files?: UploadedTranscriptFile[];
    };
    const hasTranscript = typeof transcript === "string" && transcript.trim().length > 0;
    const validFiles = Array.isArray(files)
      ? files.filter(
          (file) =>
            file &&
            typeof file.name === "string" &&
            typeof file.type === "string" &&
            typeof file.data === "string" &&
            (file.type.startsWith("image/") || file.type === "application/pdf")
        )
      : [];

    if (!hasTranscript && validFiles.length === 0) {
      return NextResponse.json(
        { error: "Add transcript text or upload a transcript file" },
        { status: 400 }
      );
    }

    const textCodes = hasTranscript
      ? (await extractCourseMentions(transcript)).map((c) => c.code)
      : [];
    const aiCodes = validFiles.length > 0
      ? await scanTranscriptFiles(validFiles, transcript || "")
      : [];
    const aiCourseMentions = aiCodes.length > 0
      ? await extractCourseMentions(aiCodes.join("\n"))
      : [];
    const codes = Array.from(
      new Set([...textCodes, ...aiCourseMentions.map((c) => c.code), ...aiCodes])
    )
      .map((code) => normalizeCourseCode(code))
      .filter(Boolean)
      .sort();

    return NextResponse.json({
      count: codes.length,
      codes,
      source: validFiles.length > 0 ? "ai-file-scan" : "text",
    });
  } catch (e) {
    return NextResponse.json(
      {
        error:
          e instanceof Error
            ? e.message
            : "Failed to parse transcript",
      },
      { status: 500 }
    );
  }
}
