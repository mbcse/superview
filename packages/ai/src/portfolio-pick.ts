import { generateObject } from "ai";
import { z } from "zod";
import { resolveLanguageModel } from "./llm.js";
import type { UniverseRow } from "./universe-match.js";

const pickSchema = z.object({
  holdings: z
    .array(
      z.object({
        tokenId: z.string(),
        conviction: z.number().min(0.2).max(1),
        rationale: z.string().max(280)
      })
    )
    .min(5)
    .max(8)
});

export type PickedHolding = z.infer<typeof pickSchema>["holdings"][number];

export async function pickPortfolioHoldings(input: {
  take: string;
  interpretation: string;
  parallelNotes: string;
  universe: UniverseRow[];
}): Promise<PickedHolding[]> {
  const catalog = input.universe.map((u) => ({
    tokenId: u.tokenId,
    symbol: u.symbol,
    name: u.legalName,
    sector: u.sector,
    summary: u.businessSummary.slice(0, 200)
  }));
  const { object } = await generateObject({
    model: resolveLanguageModel() as unknown as Parameters<typeof generateObject>[0]["model"],
    schema: pickSchema,
    prompt: `You are building a stock portfolio for this take.

Take: ${input.take}
Interpretation: ${input.interpretation}

External research (company names discovered on the web):
${input.parallelNotes || "(none yet)"}

You MUST only pick tokenId values from this holdable catalog (tokenized stocks we can actually buy):
${JSON.stringify(catalog, null, 2)}

Pick 5-8 holdings with conviction 0.2-1.0 and a specific rationale tying each name to the take. Prefer names that appear in the external research when they exist in the catalog.`
  });
  const allowed = new Set(input.universe.map((u) => u.tokenId));
  const holdings = object.holdings.filter((h) => allowed.has(h.tokenId));
  if (holdings.length < 5) {
    throw new Error("Model returned too few holdable names; retry or widen catalog.");
  }
  return holdings.slice(0, 8);
}
