import { NextResponse } from "next/server";
import { getPrereqTree } from "@/lib/prereq-chain";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code")?.trim();
  const maxDepthRaw = url.searchParams.get("maxDepth");

  if (!code) {
    return NextResponse.json(
      { error: "Missing required query parameter: code" },
      { status: 400 }
    );
  }

  const maxDepth = Math.max(
    0,
    Math.min(8, maxDepthRaw ? parseInt(maxDepthRaw, 10) : 5)
  );

  const tree = await getPrereqTree(code, { maxDepth });
  if (!tree) {
    return NextResponse.json(
      { error: "Course not found" },
      { status: 404 }
    );
  }

  return NextResponse.json(tree);
}

