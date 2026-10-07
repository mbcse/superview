export type MarkLeg = {
  tokenId: string;
  symbol?: string;
  weightBps: number;
  last: number | null;
  publish: number | null;
  prior?: number | null;
};

export type HoldingContribution = {
  tokenId: string;
  symbol?: string;
  weightBps: number;
  last: number | null;
  publish: number | null;
  prior: number | null;
  ret: number | null;
  chgPct: number | null;
  contrib: number | null;
};

export function asNum(d: unknown): number | null {
  if (d == null) return null;
  const n = typeof d === "number" ? d : Number(d);
  return Number.isFinite(n) ? n : null;
}

export function chgPct(last: number | null, prior: number | null): number | null {
  if (last == null || prior == null || prior === 0) return null;
  return (last - prior) / prior;
}

export function weightedBookIndex(legs: MarkLeg[]): {
  index: number | null;
  contributions: HoldingContribution[];
} {
  let acc = 0;
  let w = 0;
  const contributions: HoldingContribution[] = legs.map((l) => {
    const prior = l.prior ?? null;
    const pct = chgPct(l.last, prior);
    if (l.last == null || l.publish == null || l.publish <= 0) {
      return {
        tokenId: l.tokenId,
        symbol: l.symbol,
        weightBps: l.weightBps,
        last: l.last,
        publish: l.publish,
        prior,
        ret: null,
        chgPct: pct,
        contrib: null
      };
    }
    const ret = l.last / l.publish;
    const contrib = (l.weightBps / 10_000) * ret;
    acc += contrib;
    w += l.weightBps / 10_000;
    return {
      tokenId: l.tokenId,
      symbol: l.symbol,
      weightBps: l.weightBps,
      last: l.last,
      publish: l.publish,
      prior,
      ret,
      chgPct: pct,
      contrib
    };
  });
  return { index: w > 0 ? 100 * (acc / w) : null, contributions };
}

export function unitsToQty(amount: unknown, decimals: number): number {
  return Number(amount ?? 0) / 10 ** decimals;
}

export type QuotePoint = number | { last?: number | null; tokenLast?: number | null };
export type QuoteBook = Map<string, QuotePoint> | Record<string, QuotePoint>;

/** Turn a stored token mid into share USD when the two RH books disagree. */
export function asSharePrice(
  price: number | null | undefined,
  share: number | null | undefined,
  token: number | null | undefined
): number | null {
  if (price == null || !Number.isFinite(price)) return null;
  if (share == null || token == null || !(share > 0) || !(token > 0)) {
    if (share != null && share > 0 && Math.abs(price - share) / share > 0.35) return share;
    return price;
  }
  const ratio = share / token;
  if (!Number.isFinite(ratio) || Math.abs(ratio - 1) < 0.02) return price;
  if (Math.abs(price - token) <= Math.abs(price - share)) return price * ratio;
  return price;
}

export function pickQuoteValue(
  quotes: QuoteBook,
  symbol: string,
  field: "last" | "tokenLast" = "last"
): number | null {
  const u = symbol.toUpperCase();
  const bare = u.startsWith("RH") && u.length > 2 ? u.slice(2) : u;
  const keys = [u, bare, `RH${bare}`].filter(Boolean);
  const get = (k: string) => {
    const v = quotes instanceof Map ? quotes.get(k) ?? quotes.get(k.toUpperCase()) : quotes[k] ?? quotes[k.toUpperCase()];
    if (v == null) return null;
    if (typeof v === "number") return field === "last" ? v : null;
    return asNum(field === "last" ? v.last : v.tokenLast);
  };
  for (const k of keys) {
    const n = get(k);
    if (n != null) return n;
  }
  return null;
}

export function pickQuoteLast(quotes: QuoteBook, symbol: string): number | null {
  return pickQuoteValue(quotes, symbol, "last");
}

export function liveVsSpy(args: {
  holdings: Array<{ symbol: string; weightBps: number; last?: number | null; publish?: number | null }>;
  quotes: QuoteBook;
  spyPublish?: number | null;
  storedBenchmark?: number | null;
  fallback?: number | null;
}): number | null {
  const legs: MarkLeg[] = args.holdings.map((h) => {
    const last = pickQuoteLast(args.quotes, h.symbol) ?? h.last ?? null;
    const token = pickQuoteValue(args.quotes, h.symbol, "tokenLast");
    return {
      tokenId: h.symbol,
      symbol: h.symbol,
      weightBps: h.weightBps,
      last,
      publish: asSharePrice(h.publish ?? null, last, token)
    };
  });
  const book = weightedBookIndex(legs);
  if (book.index == null) return args.fallback ?? null;
  const spyLast = pickQuoteLast(args.quotes, "SPY") ?? pickQuoteLast(args.quotes, "RHSPY");
  const spyToken = pickQuoteValue(args.quotes, "SPY", "tokenLast") ?? pickQuoteValue(args.quotes, "RHSPY", "tokenLast");
  const spyPublish = asSharePrice(args.spyPublish ?? null, spyLast, spyToken);
  if (spyLast != null && spyPublish != null && spyPublish > 0) {
    return book.index - 100 * (spyLast / spyPublish);
  }
  if (args.storedBenchmark != null) return book.index - args.storedBenchmark;
  return args.fallback ?? null;
}
