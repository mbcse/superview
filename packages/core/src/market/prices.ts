import { Prisma, prisma } from "@takeandstake/db";
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

export function quoteKeys(symbol: string) {
  const u = symbol.toUpperCase();
  const bare = u.replace(/^RH/, "");
  return [u, bare, bare ? `RH${bare}` : ""].filter(Boolean);
}

export function lookupPx(book: Map<string, number> | undefined, symbol: string) {
  if (!book?.size) return undefined;
  for (const k of quoteKeys(symbol)) {
    const v = book.get(k);
    if (v != null && Number.isFinite(v)) return v;
  }
}

export function setPriceAliases(book: Map<string, number>, symbol: string, px: number) {
  for (const k of quoteKeys(symbol)) book.set(k, px);
}

export function dayChangePct(last: number | null | undefined, prior: number | null | undefined) {
  if (last == null || prior == null || prior === 0 || !Number.isFinite(last) || !Number.isFinite(prior)) return null;
  const pct = (last - prior) / prior;
  if (!Number.isFinite(pct) || Math.abs(pct) > 0.45) return null;
  return pct;
}

export function inheritAliasChg<T extends { symbol: string; chgPct?: number | null }>(quotes: T[]) {
  const byKey = new Map<string, number>();
  for (const q of quotes) {
    if (q.chgPct == null || !Number.isFinite(q.chgPct) || q.chgPct === 0) continue;
    for (const k of quoteKeys(q.symbol)) byKey.set(k, q.chgPct);
  }
  for (const q of quotes) {
    if (q.chgPct != null && q.chgPct !== 0) continue;
    const inherited = quoteKeys(q.symbol).map((k) => byKey.get(k)).find((v) => v != null && v !== 0);
    if (inherited != null) q.chgPct = inherited;
  }
  return quotes;
}

export function nySessionStart(now = Date.now()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const ymd = fmt.format(new Date(now));
  let lo = now - 36 * 60 * 60 * 1000;
  let hi = now;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (fmt.format(new Date(mid)) === ymd) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

function nyWeekday(ms: number) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date(ms));
}

function nyMinutes(ms: number) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value])
  );
  return Number(parts.hour) * 60 + Number(parts.minute);
}

/** Start of the last cash session (skips Sat/Sun; before 9:30 ET uses the prior weekday). */
export function lastCashSessionStart(now = Date.now()) {
  let cursor = now;
  for (let i = 0; i < 6; i++) {
    const start = nySessionStart(cursor);
    const wd = nyWeekday(start.getTime() + 12 * 3600_000);
    const weekend = wd === "Sat" || wd === "Sun";
    const beforeOpen = i === 0 && !weekend && nyMinutes(now) < 9 * 60 + 30;
    if (!weekend && !beforeOpen) return start;
    cursor = start.getTime() - 3600_000;
  }
  return nySessionStart(now);
}

export function quoteHasSymbol<T extends { symbol: string }>(quotes: T[], symbol: string) {
  const have = new Set(quotes.map((q) => q.symbol.toUpperCase()));
  return quoteKeys(symbol).some((k) => have.has(k));
}

export function filterQuotes<T extends { symbol: string }>(quotes: T[], symbols?: string[]) {
  if (!symbols?.length) return quotes;
  const want = new Set<string>();
  for (const s of symbols) for (const k of quoteKeys(s)) want.add(k);
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
      const prev = lookupPx(prior, token.symbol);
      const chgPct = dayChangePct(last, prev);
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

let closeBookAt = 0;
const closeBook = new Map<string, number>();
let closeBookLoad: Promise<void> | null = null;

async function loadCloseBook(symbols: string[]) {
  const need = symbols.filter((s) => lookupPx(closeBook, s) == null);
  if (!need.length && Date.now() - closeBookAt < 30_000) return;
  if (closeBookLoad) return closeBookLoad;
  closeBookLoad = (async () => {
    const tokens = await prisma.stockToken.findMany({
      where: { chainId: 4663, symbol: { in: [...new Set(symbols.flatMap((s) => quoteKeys(s)))] } },
      select: { id: true, symbol: true, chainId: true }
    });
    const closes = await prevCloseByTokens(tokens);
    if (Date.now() - closeBookAt > 30_000) closeBook.clear();
    for (const t of tokens) {
      const px = closes.get(t.id);
      if (px != null) setPriceAliases(closeBook, t.symbol, px);
    }
    closeBookAt = Date.now();
  })().finally(() => {
    closeBookLoad = null;
  });
  return closeBookLoad;
}

export async function attachDayChange<T extends { symbol: string; last?: number | null; chgPct?: number | null }>(quotes: T[]) {
  if (!quotes.length) return quotes;
  await loadCloseBook(quotes.map((q) => q.symbol));
  for (const q of quotes) {
    const next = dayChangePct(q.last, lookupPx(closeBook, q.symbol) ?? null);
    if (next != null) q.chgPct = next;
  }
  return inheritAliasChg(quotes);
}

export async function prevCloseByTokens(tokens: Array<{ id: string; symbol: string; chainId?: number }>) {
  const start = lastCashSessionStart();
  const wanted = new Set<string>();
  for (const t of tokens) for (const k of quoteKeys(t.symbol)) wanted.add(k);
  const aliases = await prisma.stockToken.findMany({
    where: { chainId: 4663, symbol: { in: [...wanted] } },
    select: { id: true, symbol: true }
  });
  const idBySym = new Map(aliases.map((a) => [a.symbol.toUpperCase(), a.id]));
  const idsFor = new Map<string, string[]>();
  const allIds = new Set<string>();
  for (const t of tokens) {
    const ids = [t.id];
    for (const k of quoteKeys(t.symbol)) {
      const id = idBySym.get(k);
      if (id && !ids.includes(id)) ids.push(id);
    }
    idsFor.set(t.id, ids);
    for (const id of ids) allIds.add(id);
  }
  const ids = [...allIds];
  const snaps = ids.length
    ? await prisma.$queryRaw<Array<{ tokenId: string; price: unknown }>>`
        SELECT s."tokenId", s.price
        FROM "PriceSnapshot" s
        JOIN (
          SELECT "tokenId", MAX("observedAt") AS seen
          FROM "PriceSnapshot"
          WHERE source = 'RH_REST'::"PriceSource"
            AND "observedAt" < ${start}
            AND "tokenId" IN (${Prisma.join(ids)})
          GROUP BY "tokenId"
        ) last ON last."tokenId" = s."tokenId" AND last.seen = s."observedAt"
        WHERE s.source = 'RH_REST'::"PriceSource"
      `
    : [];
  const latest = new Map<string, number>();
  for (const s of snaps) {
    const n = Number(s.price);
    if (Number.isFinite(n)) latest.set(s.tokenId, n);
  }
  const out = new Map<string, number>();
  for (const t of tokens) {
    for (const id of idsFor.get(t.id) ?? []) {
      const px = latest.get(id);
      if (px != null) {
        out.set(t.id, px);
        break;
      }
    }
  }
  return out;
}

export async function liveQuoteForToken(
  token: {
    id: string;
    symbol: string;
    feedAddress: string | null;
    logoUrl?: string | null;
    isTradingHalt?: boolean;
  },
  priorClose?: number | null
): Promise<LiveQuote> {
  const snaps = await latestPrices(token.id, 2);
  const last = asNum(snaps[0]?.price);
  const prior =
    priorClose ?? (await prevCloseByTokens([token]).then((m) => m.get(token.id) ?? null)) ?? null;
  const asOf = snaps[0]?.observedAt?.toISOString() ?? null;
  const stale = !asOf || Date.now() - new Date(asOf).getTime() > STALE_MS;
  const chg = dayChangePct(last, prior);
  return {
    tokenId: token.id,
    symbol: token.symbol,
    last,
    bid: asNum(snaps[0]?.bid),
    ask: asNum(snaps[0]?.ask),
    prior: prior ?? null,
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
