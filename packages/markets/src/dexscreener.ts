import { pctToFraction } from "@takeandstake/shared";
import { providerFetch } from "./http.js";
import type { Quote } from "./types.js";

export type DexPair = {
  mint: string;
  priceUsd: number;
  chg: number | null;
  liquidityUsd: number | null;
  volume24: number | null;
  url?: string;
};

export async function dexScreenerQuotes(mints: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  const unique = [...new Set(mints.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 30) {
    const batch = unique.slice(i, i + 30);
    const res = await providerFetch("dexscreener", `https://api.dexscreener.com/tokens/v1/solana/${batch.join(",")}`);
    if (!res?.ok) continue;
    const rows = (await res.json()) as Array<{
      baseToken?: { address?: string };
      priceUsd?: string;
      priceChange?: { h24?: number };
      liquidity?: { usd?: number };
      volume?: { h24?: number };
    }>;
    const now = Date.now();
    for (const row of Array.isArray(rows) ? rows : []) {
      const mint = String(row.baseToken?.address ?? "");
      const last = Number(row.priceUsd);
      if (!mint || !Number.isFinite(last) || last <= 0) continue;
      if (out.has(mint)) continue;
      out.set(mint, {
        assetId: mint,
        last,
        chg: pctToFraction(row.priceChange?.h24 ?? null),
        liquidityUsd: Number(row.liquidity?.usd) || null,
        observedAt: now,
        provider: "DEXSCREENER",
        halt: false
      });
    }
  }
  return out;
}
