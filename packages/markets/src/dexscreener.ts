import { companyTicker, pctToFraction } from "@takeandstake/shared";
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

export async function dexScreenerQuotes(
  mints: string[],
  opts?: { chain?: "solana" | "base" | "monad"; symbols?: Map<string, string> }
): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  const unique = [...new Set(mints.filter(Boolean))];
  const wantedExact = new Set(unique);
  const wantedLower = new Set(unique.map((m) => m.toLowerCase()));
  const evm = opts?.chain === "base" || opts?.chain === "monad";
  for (let i = 0; i < unique.length; i += 30) {
    const batch = unique.slice(i, i + 30);
    const chain = opts?.chain ?? "solana";
    const res = await providerFetch("dexscreener", `https://api.dexscreener.com/tokens/v1/${chain}/${batch.join(",")}`);
    if (!res?.ok) continue;
    const rows = (await res.json()) as Array<{
      baseToken?: { address?: string; symbol?: string };
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
      if (evm ? !wantedLower.has(mint.toLowerCase()) : !wantedExact.has(mint)) continue;
      const expect = opts?.symbols?.get(mint) ?? opts?.symbols?.get(mint.toLowerCase());
      const got = row.baseToken?.symbol;
      if (expect && got && companyTicker(expect) !== companyTicker(got)) continue;
      if (out.has(mint) || (evm && out.has(mint.toLowerCase()))) continue;
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
