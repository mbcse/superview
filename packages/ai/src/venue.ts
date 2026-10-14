import {
  chainLabel,
  sourceRestricted,
  underlyingTicker,
  type AssetSource,
  type World
} from "@takeandstake/shared";

export type VenueListing = {
  tokenId: string;
  symbol: string;
  chainId: number;
  source: AssetSource | string;
  underlyingTicker: string;
  liquidityUsd: number;
  priceAgeMs: number;
  halted: boolean;
  status: string;
  spread?: number | null;
};

export type RouteContext = {
  world: World;
  allowedChains: number[];
  country?: string | null;
  walletChains?: number[];
  live?: boolean;
};

export type VenueChoice = {
  tokenId: string;
  chainId: number;
  symbol: string;
  underlyingTicker: string;
  score: number;
  reason: string;
};

export type RoutedHolding = VenueChoice & {
  weightBps: number;
  options: VenueChoice[];
};

export function scoreListing(listing: VenueListing, ctx: RouteContext): VenueChoice | null {
  if (!ctx.allowedChains.includes(listing.chainId)) return null;
  if (listing.halted || listing.status !== "ACTIVE") return null;
  if (sourceRestricted(listing.source as AssetSource, ctx.country)) return null;
  let score = 10 + Math.log10(bookLiquidity(listing)) * 4;
  if (listing.source === "ROBINHOOD" || listing.source === "COINBASE") score += 2;
  if (listing.priceAgeMs > 30 * 60_000) score -= 4;
  else if (listing.priceAgeMs > 10 * 60_000) score -= 1;
  if (listing.spread != null) score -= Math.min(listing.spread * 40, 8);
  if (ctx.live && ctx.walletChains?.includes(listing.chainId)) score += 2;
  return {
    tokenId: listing.tokenId,
    chainId: listing.chainId,
    symbol: listing.symbol,
    underlyingTicker: listing.underlyingTicker,
    score,
    reason: `${chainLabel(listing.chainId)} ${listing.source}`
  };
}

export function bookLiquidity(listing: VenueListing): number {
  return listing.liquidityUsd > 0 ? listing.liquidityUsd : 1;
}

const SPREAD_BAND = 3;

export function routeBasket(
  companies: Array<{ ticker: string; weightBps: number; listings: VenueListing[] }>,
  ctx: RouteContext
): RoutedHolding[] {
  const scored = companies.map((c) => {
    const options = c.listings
      .map((l) => scoreListing(l, ctx))
      .filter((x): x is VenueChoice => x != null)
      .sort((a, b) => b.score - a.score);
    return { ...c, options };
  });
  const used = new Map<number, number>();
  const picked = new Map<string, RoutedHolding>();
  const lockFirst = [...scored]
    .filter((c) => c.options[0])
    .sort((a, b) => {
      const ga = a.options[0]!.score - (a.options[1]?.score ?? Number.NEGATIVE_INFINITY);
      const gb = b.options[0]!.score - (b.options[1]?.score ?? Number.NEGATIVE_INFINITY);
      return gb - ga;
    });
  for (const c of lockFirst) {
    const ticker = c.ticker.toUpperCase();
    if (picked.has(ticker)) continue;
    const best = c.options[0];
    if (!best) continue;
    const close = c.options.filter((o) => o.score >= best.score - SPREAD_BAND);
    let pick = close[0] ?? best;
    let load = used.get(pick.chainId) ?? 0;
    for (const option of close) {
      const n = used.get(option.chainId) ?? 0;
      if (n < load || (n === load && option.score > pick.score)) {
        pick = option;
        load = n;
      }
    }
    used.set(pick.chainId, (used.get(pick.chainId) ?? 0) + 1);
    const reason =
      pick.chainId !== best.chainId
        ? `Picked ${chainLabel(pick.chainId)} for ${ticker}: spread across desks`
        : close.length > 1
          ? `Picked ${chainLabel(pick.chainId)} for ${ticker}: ${pick.reason}`
          : `Picked ${chainLabel(pick.chainId)} for ${ticker}: ${pick.reason}`;
    picked.set(ticker, { ...pick, weightBps: c.weightBps, reason, options: c.options });
  }
  return scored.map((c) => picked.get(c.ticker.toUpperCase())).filter((row): row is RoutedHolding => row != null);
}

export function assertOneCompanyOnce(holdings: Array<{ underlyingTicker?: string | null; symbol: string; source?: string | null }>) {
  const seen = new Set<string>();
  for (const h of holdings) {
    const key = (h.underlyingTicker || underlyingTicker(h.symbol, h.source)).toUpperCase();
    if (!key) continue;
    if (seen.has(key)) throw new Error(`duplicate_company:${key}`);
    seen.add(key);
  }
}

export function listingFromToken(t: {
  id: string;
  symbol: string;
  chainId: number;
  source: string;
  underlyingTicker?: string | null;
  liquidityUsd?: { toNumber?: () => number } | number | null;
  isTradingHalt: boolean;
  status: string;
  prices?: Array<{ observedAt: Date }>;
}): VenueListing {
  const last = t.prices?.[0]?.observedAt;
  return {
    tokenId: t.id,
    symbol: t.symbol,
    chainId: t.chainId,
    source: t.source,
    underlyingTicker: t.underlyingTicker || underlyingTicker(t.symbol, t.source),
    liquidityUsd: typeof t.liquidityUsd === "number" ? t.liquidityUsd : Number(t.liquidityUsd?.toNumber?.() ?? t.liquidityUsd ?? 0),
    priceAgeMs: last ? Date.now() - last.getTime() : 0,
    halted: t.isTradingHalt,
    status: t.status
  };
}
