import { findSimilar } from "./embeddings";

export async function retrieve(
  query: string,
  topK: number = 5
): Promise<string[]> {
  const results = await findSimilar(query, topK);

  return results
    .filter((r) => r.score > 0.3)
    .map((r) => r.entry.text);
}
