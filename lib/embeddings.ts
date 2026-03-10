import { openai } from "@ai-sdk/openai";
import { embed } from "ai";
import type { EmbeddingEntry } from "./course-data";

const STORED_DIMS = 256;

let cachedIndex: EmbeddingEntry[] | null = null;

export async function loadIndex(): Promise<EmbeddingEntry[]> {
  if (cachedIndex) return cachedIndex;

  const data = await import("@/data/embeddings.json");
  cachedIndex = data.default as EmbeddingEntry[];
  return cachedIndex;
}

export async function embedText(text: string): Promise<number[]> {
  const { embedding } = await embed({
    model: openai.embedding("text-embedding-3-small"),
    value: text,
  });
  return embedding.slice(0, STORED_DIMS);
}

function normalize(vec: number[]): number[] {
  let norm = 0;
  for (const v of vec) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm === 0) return vec;
  return vec.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  const na = normalize(a);
  const nb = normalize(b);
  let dot = 0;
  for (let i = 0; i < na.length; i++) {
    dot += na[i] * nb[i];
  }
  return dot;
}

export async function findSimilar(
  query: string,
  topK: number = 8
): Promise<{ entry: EmbeddingEntry; score: number }[]> {
  const index = await loadIndex();
  const queryEmbedding = await embedText(query);

  const scored = index.map((entry) => ({
    entry,
    score: cosineSimilarity(queryEmbedding, entry.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK);
}
