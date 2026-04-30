import { findSimilar } from "./embeddings";
import type { EmbeddingEntry } from "./course-data";

function formatReferenceSource(metadata: EmbeddingEntry["metadata"]): string {
  const type = metadata.type.replaceAll("_", " ");
  const source = metadata.source;

  if (source.endsWith(".json")) {
    return `UC Davis catalog snapshot (${type}; data source: ${source})`;
  }

  return `Retrieved academic reference (${type}; data source: ${source})`;
}

export async function retrieve(
  query: string,
  topK: number = 5
): Promise<string[]> {
  const results = await findSimilar(query, topK);

  return results
    .filter((r) => r.score > 0.3)
    .map((r, i) => {
      const source = formatReferenceSource(r.entry.metadata);
      return `[Reference ${i + 1} source: ${source}]\n${r.entry.text}`;
    });
}
