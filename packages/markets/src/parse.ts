import { z } from "zod";

export const jupiterPriceRow = z.object({
  usdPrice: z.number().positive().optional(),
  liquidity: z.number().optional(),
  priceChange24h: z.number().optional()
});

export const jupiterPriceBook = z.record(jupiterPriceRow);

export const jupiterSwapQuoteRow = z.object({
  inAmount: z.string().optional(),
  outAmount: z.string(),
  priceImpactPct: z.union([z.string(), z.number()]).optional(),
  routePlan: z.array(z.unknown()).optional()
});

export const dexPairRow = z.object({
  baseToken: z.object({ address: z.string().optional() }).optional(),
  priceUsd: z.string().optional(),
  priceChange: z.object({ h24: z.number().optional() }).optional(),
  liquidity: z.object({ usd: z.number().optional() }).optional(),
  volume: z.object({ h24: z.number().optional() }).optional()
});

export const xstockPriceRow = z.object({
  quote: z.number().optional(),
  price: z.number().optional()
});

export function parseJson<T>(schema: z.ZodType<T>, raw: unknown): T | null {
  const out = schema.safeParse(raw);
  return out.success ? out.data : null;
}
