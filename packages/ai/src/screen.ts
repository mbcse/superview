import { genObject } from "./generate.js";
import { researchModel } from "./llm.js";
import { fill, SCREENER_PROMPT } from "./prompts/index.js";
import { screenerSchema, type ScreenerOut } from "./prompts/schemas.js";
import { chunk, mapPool } from "./pool.js";
import { cosine } from "./embed.js";

export type ScreenRow = {
  symbol: string;
  legalName: string;
  businessSummary: string;
  sector: string | null;
  tags: unknown;
  embedding: number[];
};

export function catalogCard(u: ScreenRow) {
  const tags = Array.isArray(u.tags) ? (u.tags as string[]).slice(0, 5) : [];
  return {
    symbol: u.symbol,
    name: u.legalName,
    sector: u.sector || undefined,
    what: (u.businessSummary || "").slice(0, 180) || undefined,
    tags: tags.length ? tags : undefined
  };
}

export function orderByThesis(universe: ScreenRow[], queryEmbedding: number[]) {
  if (!queryEmbedding.length) return universe;
  return [...universe].sort(
    (a, b) => cosine(queryEmbedding, b.embedding) - cosine(queryEmbedding, a.embedding)
  );
}

export async function screenCatalog(input: {
  universe: ScreenRow[];
  interpretation: string;
  mechanism: string;
  angles: unknown;
  queryEmbedding: number[];
  skipSymbols?: Set<string>;
  onBatch?: (info: {
    done: number;
    total: number;
    found: number;
    batchSymbols: string[];
    batchPicks: ScreenerOut["picks"];
  }) => Promise<void>;
}): Promise<ScreenerOut["picks"]> {
  const skip = new Set([...(input.skipSymbols ?? [])].map((s) => s.toUpperCase()));
  const ordered = orderByThesis(
    input.universe.filter((u) => !skip.has(u.symbol.toUpperCase())),
    input.queryEmbedding
  );
  if (!ordered.length) return [];
  const batches = chunk(ordered, 25);
  const picks: ScreenerOut["picks"] = [];
  const seen = new Set<string>();
  let completed = 0;

  await mapPool(batches, 3, async (slice, i) => {
    const allowed = new Set(slice.map((u) => u.symbol.toUpperCase()));
    const out = await genObject({
      model: researchModel(),
      schema: screenerSchema,
      label: `screen ${i + 1}/${batches.length}`,
      prompt: fill(SCREENER_PROMPT, {
        interpretation: input.interpretation,
        mechanism: input.mechanism,
        angles: JSON.stringify(input.angles),
        batch: `${i + 1}/${batches.length}`,
        candidates: JSON.stringify(slice.map(catalogCard))
      })
    });
    const batchPicks = out.picks.filter((p) => p.relevant !== false && allowed.has(p.symbol.toUpperCase()));
    for (const p of batchPicks) {
      const key = p.symbol.toUpperCase();
      if (seen.has(key)) continue;
      seen.add(key);
      picks.push(p);
    }
    completed += 1;
    await input.onBatch?.({
      done: completed,
      total: batches.length,
      found: picks.length,
      batchSymbols: slice.map((u) => u.symbol),
      batchPicks
    });
    return batchPicks;
  });

  return picks;
}
