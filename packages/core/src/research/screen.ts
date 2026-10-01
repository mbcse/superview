export function cosine(a: number[], b: number[]): number {
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

export function topK(
  query: number[],
  items: Array<{ id: string; embedding: number[] }>,
  k = 25
): Array<{ id: string; score: number }> {
  return items
    .map((i) => ({ id: i.id, score: cosine(query, i.embedding) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);
}

export function keywordScreen(action: string, summary: string): number {
  const terms = action.toLowerCase().split(/\W+/).filter((t) => t.length > 3);
  const hay = summary.toLowerCase();
  if (terms.length === 0) return 0;
  const hits = terms.filter((t) => hay.includes(t)).length;
  return hits / terms.length;
}
