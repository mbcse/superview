import {
  BASE_CHAIN_ID,
  MONAD_CHAIN_ID,
  ROBINHOOD_CHAIN_ID,
  SOLANA_CHAIN_ID,
  cashTokenIdForChain,
  chainOf,
  isKnownChainId,
  type Benchmark,
  type CashSymbol
} from "./chains.js";

export type { Benchmark, CashSymbol } from "./chains.js";

export const WORLDS = ["STOCKS", "MEMES"] as const;
export type World = (typeof WORLDS)[number];

export const ASSET_SOURCES = ["ROBINHOOD", "XSTOCKS", "BAGS", "PUMPFUN", "COINBASE", "OTHER"] as const;
export type AssetSource = (typeof ASSET_SOURCES)[number];

export const VENUES = ["RH_BOOK", "BAGS_CURVE", "PUMP_CURVE", "PUMPSWAP", "AMM", "ZEROX_EVM", "KURU_FLOW"] as const;
export type Venue = (typeof VENUES)[number];

export type Desk = { world: World; chainId: number };

export const DESKS: Array<
  Desk & {
    id: string;
    title: string;
    cash: CashSymbol;
    cashDecimals: number;
    benchmark: Benchmark;
    live: boolean;
    hidden?: boolean;
  }
> = [
  {
    id: "stocks-rh",
    world: "STOCKS",
    chainId: ROBINHOOD_CHAIN_ID,
    title: "Stocks · Robinhood Chain",
    cash: "USDG",
    cashDecimals: 6,
    benchmark: "SPY",
    live: false,
    hidden: true
  },
  {
    id: "stocks-sol",
    world: "STOCKS",
    chainId: SOLANA_CHAIN_ID,
    title: "Stocks · Solana",
    cash: "USDC",
    cashDecimals: 6,
    benchmark: "SPY",
    live: false,
    hidden: true
  },
  {
    id: "stocks-base",
    world: "STOCKS",
    chainId: BASE_CHAIN_ID,
    title: "Stocks · Base",
    cash: "USDC",
    cashDecimals: 6,
    benchmark: "SPY",
    live: false,
    hidden: true
  },
  {
    id: "stocks-monad",
    world: "STOCKS",
    chainId: MONAD_CHAIN_ID,
    title: "Stocks · Monad",
    cash: "AUSD",
    cashDecimals: 6,
    benchmark: "SPY",
    live: true
  },
  {
    id: "memes-sol",
    world: "MEMES",
    chainId: SOLANA_CHAIN_ID,
    title: "Memes · Solana",
    cash: "USDC",
    cashDecimals: 6,
    benchmark: "SOL",
    live: true
  },
  {
    id: "memes-rh",
    world: "MEMES",
    chainId: ROBINHOOD_CHAIN_ID,
    title: "Memes · Robinhood Chain",
    cash: "USDG",
    cashDecimals: 6,
    benchmark: "SOL",
    live: false,
    hidden: true
  }
];

export function parseWorld(raw: unknown, fallback: World = "STOCKS"): World {
  const v = String(raw ?? "").toUpperCase();
  return v === "MEMES" ? "MEMES" : fallback;
}

export function parseChainId(raw: unknown, world: World = "STOCKS"): number {
  const n = Number(raw);
  if (Number.isFinite(n) && isKnownChainId(n)) return n;
  return world === "MEMES" ? SOLANA_CHAIN_ID : MONAD_CHAIN_ID;
}

export function parseAllowedChains(raw: unknown, world: World = "STOCKS"): number[] {
  if (Array.isArray(raw)) {
    const ids = raw.map((v) => Number(v)).filter((n) => Number.isFinite(n) && isKnownChainId(n));
    if (ids.length) return clampStockChains(ids, world);
  }
  if (raw != null && raw !== "") return clampStockChains([parseChainId(raw, world)], world);
  return world === "MEMES" ? [SOLANA_CHAIN_ID] : [...LIVE_STOCK_CHAIN_IDS];
}

/** All stock desks. Keep in sync when a chain comes back. */
export const STOCK_CHAIN_IDS = [SOLANA_CHAIN_ID, ROBINHOOD_CHAIN_ID, BASE_CHAIN_ID, MONAD_CHAIN_ID];
/** Temporary: stocks research, catalog, and routing stay on Monad only. */
export const LIVE_STOCK_CHAIN_IDS = [MONAD_CHAIN_ID];

export function isLiveStockChain(chainId: number) {
  return LIVE_STOCK_CHAIN_IDS.includes(chainId);
}

function clampStockChains(ids: number[], world: World) {
  if (world !== "STOCKS") return [...new Set(ids)];
  const live = ids.filter((id) => isLiveStockChain(id));
  return live.length ? [...new Set(live)] : [...LIVE_STOCK_CHAIN_IDS];
}

export function deskOf(world: World, chainId: number) {
  const desk = DESKS.find((d) => d.world === world && d.chainId === chainId);
  if (!desk) throw new Error(`unknown_desk:${world}:${chainId}`);
  return desk;
}

export function deskOfOrNull(world: World, chainId: number) {
  return DESKS.find((d) => d.world === world && d.chainId === chainId) ?? null;
}

export function cashTokenId(world: World, chainId: number): string {
  const desk = deskOfOrNull(world, chainId);
  if (desk) return cashTokenIdForChain(desk.chainId);
  return cashTokenIdForChain(chainId);
}

export function venueSourceFor(world: World, chainId: number): AssetSource {
  if (world === "MEMES") return "BAGS";
  if (chainId === SOLANA_CHAIN_ID || chainId === MONAD_CHAIN_ID) return "XSTOCKS";
  if (chainId === BASE_CHAIN_ID) return "COINBASE";
  return "ROBINHOOD";
}

export function liveFlagFor(world: World, chainId: number): string {
  const desk = deskOfOrNull(world, chainId);
  if (world === "MEMES") return chainId === ROBINHOOD_CHAIN_ID ? "live_rh_bags" : "live_trading_memes";
  return desk ? chainOf(chainId).liveFlag : chainOf(chainId).liveFlag;
}

export const MEME_MIN_LIQUIDITY_USD = 50_000;
export const MEME_MIN_AGE_MS = 60 * 60 * 1000;
export const MEME_MAX_TOP_HOLDERS = 0.4;
export const MEME_MAX_DEV_BALANCE = 0.1;
export const MEME_MAX_WEIGHT = 0.25;
export const MEME_MIN_WEIGHT = 0.05;
export const MEME_MIN_HOLDINGS = 3;
export const MEME_MAX_HOLDINGS = 8;
export const MEME_MAX_POOL_SHARE = 0.02;
export const MEME_MAX_IMPACT = 0.05;
export const MEME_STALE_MS = 2 * 60 * 1000;
export const STOCKS_STALE_MS = 10 * 60 * 1000;
export const SOL_RESERVE = 0.03;
export const LIVE_MAX_TRADE_USD_MEMES = 250;
export const LIVE_DAILY_CAP_USD_MEMES = 1_000;
