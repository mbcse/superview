import { prisma } from "@takeandstake/db";
import {
  RHNVDA_FEED,
  RHSPY_FEED,
  createRhClient,
  feedAnswerToUsd,
  readAggregator
} from "@takeandstake/chain";
import { ingestRobinhoodPrices, latestPrices, liveQuoteForToken, type LiveQuote } from "../market/prices.js";
import { backingPrivacy } from "../social/backing.js";
import { asNum, asSharePrice, unitsToQty, weightedBookIndex, type HoldingContribution } from "./mark.js";
import { buildTakeSeries } from "./series.js";

export const KNOWN_CHAINLINK_FEEDS: Record<string, `0x${string}`> = {
  RHNVDA: RHNVDA_FEED,
  NVDA: RHNVDA_FEED,
  RHSPY: RHSPY_FEED,
  SPY: RHSPY_FEED
};

const USDG_DECIMALS = 6;
const TOKEN_DECIMALS = 18;
const STALE_MS = 48 * 60 * 60 * 1000;

export async function attachKnownFeeds() {
  for (const [symbol, feed] of Object.entries(KNOWN_CHAINLINK_FEEDS)) {
    await prisma.stockToken.updateMany({
      where: { symbol, chainId: 4663, feedAddress: null },
      data: { feedAddress: feed }
    });
  }
}

export async function ingestChainlinkSnapshots(rpcUrl: string) {
  if (!rpcUrl) return { written: 0 };
  await attachKnownFeeds();
  const tokens = await prisma.stockToken.findMany({ where: { feedAddress: { not: null } } });
  const client = createRhClient(rpcUrl);
  let written = 0;
  for (const t of tokens) {
    if (!t.feedAddress) continue;
    try {
      const read = await readAggregator(client, t.feedAddress as `0x${string}`, t.heartbeat);
      if (read.stale) continue;
      await prisma.priceSnapshot.create({
        data: {
          tokenId: t.id,
          source: "CHAINLINK",
          price: feedAnswerToUsd(read.answer, t.feedDecimals),
          roundId: read.roundId.toString(),
          updatedAt: new Date(Number(read.updatedAt) * 1000)
        }
      });
      written += 1;
    } catch (err) {
      console.error("chainlink", t.symbol, err);
    }
  }
  return { written };
}

async function latestMarks(tokenId: string, take = 2) {
  return latestPrices(tokenId, take);
}

async function priceAtOrAfter(tokenId: string, at: Date): Promise<number | null> {
  const row = await prisma.priceSnapshot.findFirst({
    where: { tokenId, observedAt: { gte: at } },
    orderBy: { observedAt: "asc" }
  });
  if (row) return asNum(row.price);
  const lastBefore = await prisma.priceSnapshot.findFirst({
    where: { tokenId, observedAt: { lte: at } },
    orderBy: { observedAt: "desc" }
  });
  return asNum(lastBefore?.price);
}

export type QuoteRow = LiveQuote;

export async function quoteForToken(token: {
  id: string;
  symbol: string;
  feedAddress: string | null;
  logoUrl?: string | null;
  isTradingHalt?: boolean;
}): Promise<QuoteRow> {
  return liveQuoteForToken(token);
}

export async function listQuotes(symbols?: string[]): Promise<QuoteRow[]> {
  let where: { chainId: number; symbol?: { in: string[] } } = { chainId: 4663 };
  if (symbols?.length) {
    const expanded = new Set<string>();
    for (const s of symbols) {
      const u = s.toUpperCase();
      const bare = u.replace(/^RH/, "");
      expanded.add(u);
      if (bare) {
        expanded.add(bare);
        expanded.add(`RH${bare}`);
      }
    }
    where = { chainId: 4663, symbol: { in: [...expanded] } };
  }
  const tokens = await prisma.stockToken.findMany({ where });
  return Promise.all(tokens.map((t) => quoteForToken(t)));
}

export async function markPublishedTakes(liveLast?: Map<string, number>, liveToken?: Map<string, number>) {
  const takes = await prisma.take.findMany({
    where: { status: "PUBLISHED" },
    include: {
      revisions: {
        orderBy: { number: "desc" },
        take: 1,
        include: { target: { include: { holdings: { include: { token: true } } } } }
      }
    }
  });
  const spy = await prisma.stockToken.findFirst({
    where: { chainId: 4663, symbol: { in: ["RHSPY", "SPY"] } }
  });
  const lookup = (book: Map<string, number> | undefined, symbol: string) => {
    if (!book?.size) return null;
    const u = symbol.toUpperCase();
    const bare = u.replace(/^RH/, "");
    return book.get(u) ?? book.get(bare) ?? book.get(`RH${bare}`) ?? null;
  };
  const lastOf = (symbol: string, fallback: number | null) => lookup(liveLast, symbol) ?? fallback;
  const tokenOf = (symbol: string) => lookup(liveToken, symbol);
  const shareLeg = (symbol: string, last: number | null, publish: number | null, prior: number | null) => {
    const share = lastOf(symbol, last);
    return { last: share, prior, publish: asSharePrice(publish, share, tokenOf(symbol)) };
  };
  let n = 0;
  for (const take of takes) {
    const holdings = take.revisions[0]?.target?.holdings ?? [];
    if (!holdings.length) continue;
    const legs = [];
    for (const h of holdings) {
      const snaps = await latestMarks(h.tokenId, 2);
      const priced = shareLeg(
        h.token.symbol,
        asNum(snaps[0]?.price),
        await priceAtOrAfter(h.tokenId, take.createdAt),
        asNum(snaps[1]?.price)
      );
      legs.push({
        tokenId: h.tokenId,
        symbol: h.token.symbol,
        weightBps: h.weightBps,
        ...priced
      });
    }
    const book = weightedBookIndex(legs);
    if (book.index == null) continue;
    let benchmark: number | null = null;
    let spyContrib: HoldingContribution[] = [];
    if (spy) {
      const snaps = await latestMarks(spy.id, 2);
      const priced = shareLeg(spy.symbol, asNum(snaps[0]?.price), await priceAtOrAfter(spy.id, take.createdAt), asNum(snaps[1]?.price));
      const spyLeg = {
        tokenId: spy.id,
        symbol: spy.symbol,
        weightBps: 10_000,
        ...priced
      };
      const spyBook = weightedBookIndex([spyLeg]);
      benchmark = spyBook.index;
      spyContrib = spyBook.contributions;
    }
    if (benchmark == null) continue;
    await prisma.takeValuation.create({
      data: {
        takeId: take.id,
        revisionId: take.currentRevisionId,
        asOf: new Date(),
        indexValue: book.index,
        benchmarkIndex: benchmark,
        holdingContributions: [...book.contributions, ...spyContrib]
      }
    });
    n += 1;
  }
  return { marked: n };
}

export type PocketMark = {
  navUsd: number;
  cashUsd: number;
  positionsUsd: number;
  unrealizedUsd: number;
  vsBook: number | null;
  dayPnl: number | null;
  legs: Array<{
    tokenId: string;
    symbol: string;
    qty: number;
    last: number | null;
    mtm: number | null;
    cost: number;
    pnl: number | null;
  }>;
};

export async function computePocketMark(pocketId: string): Promise<PocketMark | null> {
  const pocket = await prisma.pocket.findUnique({
    where: { id: pocketId },
    include: {
      take: { include: { valuations: { orderBy: { asOf: "desc" }, take: 2 } } },
      accounts: { include: { entries: true } },
      valuations: { orderBy: { asOf: "desc" }, take: 1 }
    }
  });
  if (!pocket) return null;
  const cashAcc = pocket.accounts.find((a) => a.kind === "CASH");
  const cashUsd = cashAcc
    ? cashAcc.entries.reduce((s, e) => s + Number(e.usdValue), 0)
    : 0;
  const legs: PocketMark["legs"] = [];
  let positionsUsd = 0;
  let cost = 0;
  for (const acc of pocket.accounts.filter((a) => a.kind === "POSITION" && a.tokenId)) {
    const token = await prisma.stockToken.findUnique({ where: { id: acc.tokenId! } });
    const qty = acc.entries.reduce((s, e) => s + unitsToQty(e.amount, TOKEN_DECIMALS), 0);
    const costUsd = acc.entries.reduce((s, e) => s + Number(e.usdValue), 0);
    const snaps = token ? await latestMarks(token.id, 1) : [];
    const last = asNum(snaps[0]?.price);
    const mtm = last == null ? null : qty * last;
    if (mtm != null) positionsUsd += mtm;
    cost += costUsd;
    legs.push({
      tokenId: acc.tokenId!,
      symbol: token?.symbol ?? acc.tokenId!,
      qty,
      last,
      mtm,
      cost: costUsd,
      pnl: mtm == null ? null : mtm - costUsd
    });
  }
  const navUsd = cashUsd + positionsUsd;
  const prevNav = asNum(pocket.valuations[0]?.navUsd);
  const book = pocket.take.valuations;
  const vsBook =
    book[0] && asNum(book[0].indexValue) != null && asNum(book[0].benchmarkIndex) != null
      ? asNum(book[0].indexValue)! - asNum(book[0].benchmarkIndex)!
      : null;
  return {
    navUsd,
    cashUsd,
    positionsUsd,
    unrealizedUsd: positionsUsd - cost,
    vsBook,
    dayPnl: prevNav == null ? null : navUsd - prevNav,
    legs
  };
}

export async function markPockets() {
  const pockets = await prisma.pocket.findMany({ where: { status: "ACTIVE" } });
  let n = 0;
  for (const p of pockets) {
    const mark = await computePocketMark(p.id);
    if (!mark) continue;
    const hasPrice = mark.legs.some((l) => l.last != null) || mark.legs.length === 0;
    if (!hasPrice && mark.legs.length) continue;
    await prisma.valuation.create({
      data: {
        pocketId: p.id,
        asOf: new Date(),
        navUsd: mark.navUsd,
        benchmarkNavUsd: mark.navUsd,
        pricesRef: mark
      }
    });
    n += 1;
  }
  return { marked: n };
}

export async function tickMarket(rpcUrl: string) {
  const rh = await ingestRobinhoodPrices().catch((e) => {
    console.error("rh prices", e);
    return { written: 0, payload: [], at: new Date().toISOString() };
  });
  const prices = await ingestChainlinkSnapshots(rpcUrl);
  const books = await markPublishedTakes();
  const pockets = await markPockets();
  return { rh, prices, books, pockets, at: new Date().toISOString() };
}

export function rangeSince(tab: string): Date | undefined {
  const now = Date.now();
  if (tab === "1D") return new Date(now - 24 * 60 * 60 * 1000);
  if (tab === "1W") return new Date(now - 7 * 24 * 60 * 60 * 1000);
  if (tab === "1M") return new Date(now - 30 * 24 * 60 * 60 * 1000);
  if (tab === "YTD") return new Date(new Date().getFullYear(), 0, 1);
  if (tab === "1Y") return new Date(now - 365 * 24 * 60 * 60 * 1000);
  return undefined;
}

export async function takeSeries(takeId: string, range = "1D") {
  const since = rangeSince(range);
  const rows = await prisma.takeValuation.findMany({
    where: { takeId, ...(since ? { asOf: { gte: since } } : {}) },
    orderBy: { asOf: "asc" }
  });
  return buildTakeSeries(rows, range);
}

export async function buildLiveBoard() {
  const quotes = await listQuotes();
  const takes = await prisma.take.findMany({
    where: { status: "PUBLISHED" },
    include: {
      author: true,
      revisions: {
        orderBy: { number: "desc" },
        take: 1,
        include: { target: { include: { holdings: { include: { token: true } } } } }
      },
      valuations: { orderBy: { asOf: "desc" }, take: 2 },
      backings: { select: { userId: true, level: true, amountUsd: true, revealAmount: true } },
      stances: true,
      linksTo: true
    },
    orderBy: { createdAt: "desc" },
    take: 50
  });
  const books = takes.map((t) => serializeFeedTake(t));
  const pockets = await prisma.pocket.findMany({
    where: { status: "ACTIVE" },
    include: { take: { include: { revisions: { orderBy: { number: "desc" }, take: 1 } } }, valuations: { orderBy: { asOf: "desc" }, take: 1 } },
    take: 40
  });
  const pocketRows = [];
  for (const p of pockets) {
    const mark = await computePocketMark(p.id);
    pocketRows.push({
      id: p.id,
      mode: p.mode,
      takeId: p.takeId,
      sentence: p.take.revisions[0]?.sentence,
      navUsd: mark?.navUsd ?? asNum(p.valuations[0]?.navUsd),
      unrealizedUsd: mark?.unrealizedUsd ?? null,
      vsBook: mark?.vsBook ?? null
    });
  }
  return { quotes, books, pockets: pocketRows, at: new Date().toISOString() };
}

export function serializeFeedTake(t: {
  id: string;
  createdAt: Date;
  author: { handle: string };
  revisions: Array<{
    sentence: string;
    target: { holdings: Array<{ tokenId: string; weightBps: number; rationale: string; token: { symbol: string; feedAddress: string | null; logoUrl?: string | null } }> } | null;
  }>;
  valuations: Array<{
    indexValue: unknown;
    benchmarkIndex: unknown;
    asOf: Date;
    holdingContributions: unknown;
  }>;
  backings: Array<{ userId?: string; level: string; amountUsd?: unknown; revealAmount?: boolean }>;
  stances: Array<{ stance: string }>;
  linksTo: Array<{ type: string }>;
}, viewerId?: string | null) {
  const rev = t.revisions[0];
  const val = t.valuations[0];
  const prev = t.valuations[1];
  const indexValue = asNum(val?.indexValue);
  const benchmarkIndex = asNum(val?.benchmarkIndex);
  const vsSpy = indexValue != null && benchmarkIndex != null ? indexValue - benchmarkIndex : null;
  const contrib = (val?.holdingContributions as HoldingContribution[] | null) ?? [];
  const spyContrib = contrib.find((c) => {
    const s = String(c.symbol ?? "").toUpperCase();
    return s === "RHSPY" || s === "SPY";
  });
  const privacy = backingPrivacy(
    t.backings.map((b) => ({
      userId: b.userId ?? "",
      level: b.level,
      amountUsd: b.amountUsd,
      revealAmount: b.revealAmount
    })),
    viewerId
  );
  return {
    id: t.id,
    sentence: rev?.sentence,
    author: t.author.handle,
    createdAt: t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt),
    holdings:
      rev?.target?.holdings.map((h) => {
        const c = contrib.find((x) => x.tokenId === h.tokenId);
        return {
          tokenId: h.tokenId,
          symbol: h.token.symbol,
          weightBps: h.weightBps,
          rationale: h.rationale,
          last: c?.last ?? null,
          publish: c?.publish ?? null,
          chgPct: c?.chgPct ?? null,
          feed: Boolean(h.token.feedAddress),
          logoUrl: h.token.logoUrl ?? null
        };
      }) ?? [],
    indexValue,
    benchmarkIndex,
    vsSpy,
    spyPublish: spyContrib?.publish ?? null,
    bookChg: indexValue != null && asNum(prev?.indexValue) != null ? indexValue - asNum(prev!.indexValue)! : null,
    asOf: val?.asOf?.toISOString() ?? null,
    watchers: t.backings.filter((b) => b.level === "WATCH").length,
    dryRun: t.backings.filter((b) => b.level === "DRY_RUN").length,
    live: t.backings.filter((b) => b.level === "LIVE").length,
    backers: privacy.backers,
    publicInvestedUsd: privacy.publicInvestedUsd,
    myInvestedUsd: privacy.myInvestedUsd,
    myRevealAmount: privacy.myRevealAmount,
    bulls: t.stances.filter((s) => s.stance === "BULL").length,
    bears: t.stances.filter((s) => s.stance === "BEAR").length,
    hasCounter: t.linksTo.some((l) => l.type === "COUNTER")
  };
}
