import { companyTicker, underlyingTicker } from "@takeandstake/shared";

export type CompanyToken = {
  symbol: string;
  source?: string | null;
  underlyingTicker?: string | null;
  liquidityUsd?: { toNumber?: () => number } | number | string | null;
  universe?: { businessSummary?: string | null; embedding?: unknown } | null;
};

export function companyKey(token: {
  symbol: string;
  source?: string | null;
  underlyingTicker?: string | null;
}): string {
  return (token.underlyingTicker || underlyingTicker(token.symbol, token.source) || token.symbol).toUpperCase();
}

function liquidityOf(token: CompanyToken): number {
  const raw = token.liquidityUsd;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  if (typeof raw === "string") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(raw?.toNumber?.() ?? raw ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function hasEmbedding(token: CompanyToken): boolean {
  return Array.isArray(token.universe?.embedding) && token.universe.embedding.length > 0;
}

export function companyScreenScore(token: CompanyToken): number {
  const summary = (token.universe?.businessSummary ?? "").trim().length;
  const liq = Math.max(liquidityOf(token), 1);
  const sourceBonus = token.source === "ROBINHOOD" ? 50_000 : token.source === "COINBASE" ? 10_000 : 0;
  return (hasEmbedding(token) ? 1_000_000 : 0) + summary * 1_000 + sourceBonus + Math.log10(liq) * 10;
}

/** One row per company so a Solana listing does not crowd out RH / Base / Monad siblings. */
export function collapseTokensByCompany<T extends CompanyToken>(tokens: T[]): T[] {
  const byTicker = new Map<string, T>();
  for (const token of tokens) {
    const key = companyKey(token);
    if (!key) continue;
    const current = byTicker.get(key);
    if (!current || companyScreenScore(token) > companyScreenScore(current)) {
      byTicker.set(key, token);
    }
  }
  return [...byTicker.values()].sort((a, b) => companyScreenScore(b) - companyScreenScore(a));
}

export function tickerOf(row: { ticker?: string; symbol: string }): string {
  return (row.ticker || companyTicker(row.symbol) || row.symbol).toUpperCase();
}

/** Top names per chain, then a global fill, so RH / Base / Monad are not crowded out. */
export function pickScreenUniverse<T extends { ticker?: string; symbol: string }>(
  universe: T[],
  listingsByTicker: Map<string, Array<{ chainId: number }>>,
  allowedChains: number[],
  rank: (rows: T[]) => T[],
  perChain = 55,
  cap = 220
): { rows: T[]; addedByChain: Record<number, number> } {
  const seen = new Set<string>();
  const out: T[] = [];
  const addedByChain: Record<number, number> = {};
  for (const chainId of allowedChains) {
    let added = 0;
    const rows = universe.filter((row) =>
      (listingsByTicker.get(tickerOf(row)) ?? []).some((listing) => listing.chainId === chainId)
    );
    for (const row of rank(rows)) {
      const key = tickerOf(row);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      out.push(row);
      added += 1;
      if (added >= perChain) break;
    }
    addedByChain[chainId] = added;
  }
  for (const row of rank(universe)) {
    if (out.length >= cap) break;
    const key = tickerOf(row);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return { rows: out, addedByChain };
}

export type DeskCensus = {
  chainId: number;
  label: string;
  listings: number;
  companies: number;
  taking?: number;
};

export function catalogCensus(
  listed: Array<{ chainId: number; symbol: string; source?: string | null; underlyingTicker?: string | null }>,
  allowedChains: number[],
  labelOf: (chainId: number) => string,
  takingByChain?: Record<number, number>
): { listings: number; companies: number; desks: DeskCensus[] } {
  const companiesByChain = new Map<number, Set<string>>();
  const all = new Set<string>();
  let listings = 0;
  for (const token of listed) {
    if (!allowedChains.includes(token.chainId)) continue;
    listings += 1;
    const key = companyKey(token);
    if (!key) continue;
    all.add(key);
    const set = companiesByChain.get(token.chainId) ?? new Set();
    set.add(key);
    companiesByChain.set(token.chainId, set);
  }
  return {
    listings,
    companies: all.size,
    desks: allowedChains.map((chainId) => ({
      chainId,
      label: labelOf(chainId),
      listings: listed.filter((token) => token.chainId === chainId).length,
      companies: companiesByChain.get(chainId)?.size ?? 0,
      taking: takingByChain?.[chainId]
    }))
  };
}
