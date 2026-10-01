import { prisma } from "@takeandstake/db";
import { RH_PRICES_URL } from "@takeandstake/chain";
import { asNum } from "../portfolio/mark.js";

type RhQuote = {
  tokenSymbol?: string;
  bid?: string;
  ask?: string;
  tokenBid?: string;
  tokenAsk?: string;
  dailyTradingVolume?: string;
  isTradingHalt?: boolean;
  generatedAt?: string;
};

export type LiveQuote = {
  tokenId: string;
  symbol: string;
  last: number | null;
  bid: number | null;
  ask: number | null;
  prior: number | null;
  chgPct: number | null;
  volumeUsd: number | null;
  halt: boolean;
  source: "RH_REST" | "CHAINLINK" | null;
  asOf: string | null;
  stale: boolean;
  feed: boolean;
  logoUrl: string | null;
};

const STALE_MS = 10 * 60 * 1000;

export const QUOTES_CACHE_KEY = "quotes:last";

export type RhLiveQuote = {
  tokenId: string;
  symbol: string;
  last: number;
  tokenLast: number | null;
  bid: number | null;
  ask: number | null;
  halt: boolean;
  chgPct: number | null;
  volumeUsd: number | null;
};

export function midOf(bid: number | null, ask: number | null): number | null {
  if (bid != null && ask != null) return (bid + ask) / 2;
  return ask ?? bid;
}

export function filterQuotes<T extends { symbol: string }>(quotes: T[], symbols?: string[]) {
  if (!symbols?.length) return quotes;
  const want = new Set<string>();
  for (const s of symbols) {
    const u = s.toUpperCase();
    const bare = u.replace(/^RH/, "");
    want.add(u);
    if (bare) {
      want.add(bare);
      want.add(`RH${bare}`);
    }
  }
  return quotes.filter((q) => want.has(q.symbol.toUpperCase()));
}

export async function fetchRobinhoodQuotes(prior?: Map<string, number>) {
  const res = await fetch(RH_PRICES_URL);
  if (!res.ok) throw new Error(`RH prices ${res.status}`);
  const body = (await res.json()) as { quotes?: RhQuote[] };
  const quotes = body.quotes ?? [];
  const tokens = await prisma.stockToken.findMany({ where: { chainId: 4663 } });
  const bySymbol = new Map(tokens.map((t) => [t.symbol.toUpperCase(), t]));
  const now = new Date();
  const payload: RhLiveQuote[] = [];
  const haltUpdates: Array<{ id: string; halt: boolean }> = [];

  function tokensFor(symbol: string) {
    const u = symbol.toUpperCase();
    const found = [bySymbol.get(u), bySymbol.get(`RH${u}`), u.startsWith("RH") ? bySymbol.get(u.slice(2)) : undefined];
    const uniq = new Map<string, (typeof tokens)[number]>();
    for (const t of found) if (t) uniq.set(t.id, t);
    return [...uniq.values()];
  }

  for (const q of quotes) {
    const symbol = String(q.tokenSymbol ?? "").toUpperCase();
    const matched = tokensFor(symbol);
    if (!matched.length) continue;
    const bid = num(q.bid);
    const ask = num(q.ask);
    const tokenBid = num(q.tokenBid);
    const tokenAsk = num(q.tokenAsk);
    const shareMid = midOf(bid, ask);
    const tokenMid = midOf(tokenBid, tokenAsk);
    const last = shareMid ?? tokenMid;
    if (last == null) continue;
    const vol = num(q.dailyTradingVolume);
    const halt = Boolean(q.isTradingHalt);
    for (const token of matched) {
      const prev = prior?.get(token.symbol.toUpperCase());
      const chgPct = prev != null && prev !== 0 ? (last - prev) / prev : null;
      payload.push({
        tokenId: token.id,
        symbol: token.symbol,
        last,
        tokenLast: tokenMid,
        bid,
        ask,
        halt,
        chgPct,
        volumeUsd: vol
      });
      if (q.isTradingHalt !== undefined) haltUpdates.push({ id: token.id, halt });
    }
  }
  return { payload, haltUpdates, at: now.toISOString() };
}

export async function persistRobinhoodQuotes(
  payload: RhLiveQuote[],
  haltUpdates: Array<{ id: string; halt: boolean }>,
  at = new Date()
) {
  if (payload.length) {
    await prisma.priceSnapshot.createMany({
      data: payload.map((q) => ({
        tokenId: q.tokenId,
        source: "RH_REST" as const,
        price: q.last,
        bid: q.bid,
        ask: q.ask,
        volumeUsd: q.volumeUsd,
        halt: q.halt,
        updatedAt: at
      }))
    });
  }
  for (const h of haltUpdates) {
    await prisma.stockToken.update({ where: { id: h.id }, data: { isTradingHalt: h.halt } });
  }
  return payload.length;
}

export async function ingestRobinhoodPrices(opts?: { persist?: boolean; prior?: Map<string, number> }) {
  const fetched = await fetchRobinhoodQuotes(opts?.prior);
  const persist = opts?.persist !== false;
  const written = persist ? await persistRobinhoodQuotes(fetched.payload, fetched.haltUpdates, new Date(fetched.at)) : 0;
  return { written, payload: fetched.payload, haltUpdates: fetched.haltUpdates, at: fetched.at };
}

function num(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

async function aliasTokenIds(tokenId: string) {
  const token = await prisma.stockToken.findUnique({ where: { id: tokenId } });
  if (!token) return [tokenId];
  const u = token.symbol.toUpperCase();
  const alts = u.startsWith("RH") ? [u.slice(2)] : [`RH${u}`];
  const others = await prisma.stockToken.findMany({
    where: { chainId: token.chainId, symbol: { in: alts } },
    select: { id: true }
  });
  return [tokenId, ...others.map((t) => t.id)];
}

export async function latestPrice(tokenId: string) {
  const ids = await aliasTokenIds(tokenId);
  const rh = await prisma.priceSnapshot.findFirst({
    where: { tokenId: { in: ids }, source: "RH_REST" },
    orderBy: { observedAt: "desc" }
  });
  if (rh) return rh;
  return prisma.priceSnapshot.findFirst({
    where: { tokenId: { in: ids }, source: "CHAINLINK" },
    orderBy: { observedAt: "desc" }
  });
}

export async function latestPrices(tokenId: string, take = 2) {
  const ids = await aliasTokenIds(tokenId);
  const rh = await prisma.priceSnapshot.findMany({
    where: { tokenId: { in: ids }, source: "RH_REST" },
    orderBy: { observedAt: "desc" },
    take
  });
  if (rh.length) return rh;
  return prisma.priceSnapshot.findMany({
    where: { tokenId: { in: ids }, source: "CHAINLINK" },
    orderBy: { observedAt: "desc" },
    take
  });
}

export async function liveQuoteForToken(token: {
  id: string;
  symbol: string;
  feedAddress: string | null;
  logoUrl?: string | null;
  isTradingHalt?: boolean;
}): Promise<LiveQuote> {
  const snaps = await latestPrices(token.id, 2);
  const last = asNum(snaps[0]?.price);
  const prior = asNum(snaps[1]?.price);
  const asOf = snaps[0]?.observedAt?.toISOString() ?? null;
  const stale = !asOf || Date.now() - new Date(asOf).getTime() > STALE_MS;
  let chg = last != null && prior != null && prior !== 0 ? (last - prior) / prior : null;
  if (chg != null && Math.abs(chg) > 0.45) chg = null;
  return {
    tokenId: token.id,
    symbol: token.symbol,
    last,
    bid: asNum(snaps[0]?.bid),
    ask: asNum(snaps[0]?.ask),
    prior,
    chgPct: chg,
    volumeUsd: asNum(snaps[0]?.volumeUsd),
    halt: snaps[0]?.halt ?? token.isTradingHalt ?? false,
    source: snaps[0]?.source === "RH_REST" || snaps[0]?.source === "CHAINLINK" ? snaps[0].source : null,
    asOf,
    stale: last == null ? true : stale,
    feed: Boolean(token.feedAddress),
    logoUrl: token.logoUrl ?? null
  };
}
