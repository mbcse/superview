import { embed } from "ai";
import { embeddingModel, hasOpenAI } from "./llm.js";

export function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0;
    const y = b[i] ?? 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function embedText(text: string): Promise<number[]> {
  if (!hasOpenAI()) return [];
  const { embedding } = await embed({
    model: embeddingModel() as never,
    value: text.slice(0, 8000)
  });
  return embedding;
}

export function topKByEmbedding(
  query: number[],
  items: Array<{ id: string; embedding: number[] }>,
  k = 60
) {
  if (!query.length) return items.slice(0, k).map((i) => ({ id: i.id, score: 0 }));
  return items
    .map((i) => ({ id: i.id, score: cosine(query, i.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}
