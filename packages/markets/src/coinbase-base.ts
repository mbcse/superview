import { BASE_CHAIN_ID, isMintOrContract, sanitizeCatalogText, underlyingTicker } from "@takeandstake/shared";
import { providerFetch } from "./http.js";
import type { Quote } from "./types.js";

export const COINBASE_STOCKS_URL = "https://api.coinbase.com/v1/tokenized-stocks";
/** Chainlink heartbeat is 24h; allow a short grace before treating NAV as stale. */
export const COINBASE_NAV_STALE_MS = 26 * 60 * 60 * 1000;

export type BaseStock = {
  symbol: string;
  name: string;
  address: string;
  decimals: number;
  isin: string | null;
  logoUrl: string | null;
  multiplier: number;
  redeemPaused: boolean;
  navPrice: number | null;
  navUpdatedAt: Date | null;
  navFresh: boolean;
};

type CoinbaseToken = {
  contract_address?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  icon_url?: string;
  isin?: string;
  multiplier?: number;
  redeem_paused?: boolean;
  is_live?: boolean;
  nav_price?: number;
  nav_price_updated_at?: string;
};

export function isCoinbaseNavFresh(updatedAt: Date | null | undefined, now = Date.now()): boolean {
  if (!updatedAt) return false;
  const ms = updatedAt.getTime();
  return Number.isFinite(ms) && now - ms >= 0 && now - ms <= COINBASE_NAV_STALE_MS;
}

export function coinbaseMultiplierWad(multiplier: number): string {
  const n = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  return BigInt(Math.round(n * 1e18)).toString();
}

export function parseCoinbaseToken(raw: unknown, now = Date.now()): BaseStock | null {
  const row = raw as CoinbaseToken;
  if (row?.is_live !== true) return null;
  const address = String(row.contract_address ?? "").toLowerCase();
  if (!isMintOrContract(address, BASE_CHAIN_ID)) return null;
  const symbol = String(row.symbol ?? "").trim();
  if (!symbol) return null;
  const decimals = Number(row.decimals);
  const navPrice = Number(row.nav_price);
  const navUpdatedAt = row.nav_price_updated_at ? new Date(row.nav_price_updated_at) : null;
  const navOk = Number.isFinite(navPrice) && navPrice > 0;
  const navAt = navUpdatedAt && Number.isFinite(navUpdatedAt.getTime()) ? navUpdatedAt : null;
  return {
    symbol,
    name: sanitizeCatalogText(String(row.name ?? symbol), 80),
    address,
    decimals: Number.isFinite(decimals) && decimals >= 0 ? decimals : 8,
    isin: row.isin ? String(row.isin) : null,
    logoUrl: row.icon_url ? String(row.icon_url) : null,
    multiplier: Number(row.multiplier) > 0 ? Number(row.multiplier) : 1,
    redeemPaused: Boolean(row.redeem_paused),
    navPrice: navOk ? navPrice : null,
    navUpdatedAt: navAt,
    navFresh: navOk && isCoinbaseNavFresh(navAt, now)
  };
}

export function parseCoinbaseTokenizedStocks(body: unknown, now = Date.now()): BaseStock[] {
  const tokens = Array.isArray(body) ? body : (body as { tokens?: unknown[] } | null)?.tokens;
  if (!Array.isArray(tokens)) return [];
  const byAddress = new Map<string, BaseStock>();
  for (const row of tokens) {
    const parsed = parseCoinbaseToken(row, now);
    if (parsed) byAddress.set(parsed.address, parsed);
  }
  return [...byAddress.values()];
}

export async function listCoinbaseBaseStocks(): Promise<BaseStock[]> {
  const res = await providerFetch("coinbase", COINBASE_STOCKS_URL, {
    headers: { "user-agent": "superview-catalog/1.0" }
  });
  if (!res?.ok) return [];
  return parseCoinbaseTokenizedStocks(await res.json());
}

export function quoteByAddress(map: Map<string, Quote>, address: string): Quote | undefined {
  const direct = map.get(address) ?? map.get(address.toLowerCase());
  if (direct) return direct;
  const want = address.toLowerCase();
  for (const [key, quote] of map) {
    if (key.toLowerCase() === want) return quote;
  }
  return undefined;
}

export function pickCoinbaseQuote(args: {
  assetId: string;
  navPrice: number | null;
  navFresh: boolean;
  navUpdatedAt?: Date | null;
  dex?: Quote;
}): Quote | null {
  const { assetId, navPrice, navFresh, navUpdatedAt, dex } = args;
  if (navPrice && navPrice > 0 && (navFresh || !dex?.last)) {
    return {
      assetId,
      last: navPrice,
      chg: dex?.chg ?? null,
      liquidityUsd: dex?.liquidityUsd ?? null,
      observedAt: navUpdatedAt?.getTime() || Date.now(),
      provider: "CHAINLINK",
      halt: false
    };
  }
  if (dex && dex.last > 0) return { ...dex, assetId };
  return null;
}

export function coinbaseUnderlyingTicker(symbol: string) {
  return underlyingTicker(symbol, "COINBASE");
}
