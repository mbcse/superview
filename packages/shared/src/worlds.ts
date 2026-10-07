export const ROBINHOOD_CHAIN_ID = 4663;
export const SOLANA_CHAIN_ID = 101;
export const SOLANA_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

export const WORLDS = ["STOCKS", "MEMES"] as const;
export type World = (typeof WORLDS)[number];

export const ASSET_SOURCES = ["ROBINHOOD", "XSTOCKS", "BAGS", "PUMPFUN", "OTHER"] as const;
export type AssetSource = (typeof ASSET_SOURCES)[number];

export const VENUES = ["RH_BOOK", "BAGS_CURVE", "PUMP_CURVE", "PUMPSWAP", "AMM"] as const;
export type Venue = (typeof VENUES)[number];

export type Desk = { world: World; chainId: number };

export const USDC_SOLANA_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOL_MINT = "So11111111111111111111111111111111111111112";

export const DESKS: Array<
  Desk & {
    id: string;
    title: string;
    cash: "USDG" | "USDC";
    cashDecimals: number;
    benchmark: "SPY" | "SOL";
    live: boolean;
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
    live: true
  },
  {
    id: "stocks-sol",
    world: "STOCKS",
    chainId: SOLANA_CHAIN_ID,
    title: "Stocks · Solana",
    cash: "USDC",
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
    live: false
  }
];

export function parseWorld(raw: unknown, fallback: World = "STOCKS"): World {
  const v = String(raw ?? "").toUpperCase();
  return v === "MEMES" ? "MEMES" : fallback;
}

export function parseChainId(raw: unknown, world: World = "STOCKS"): number {
  const n = Number(raw);
  if (n === ROBINHOOD_CHAIN_ID || n === SOLANA_CHAIN_ID) return n;
  return world === "MEMES" ? SOLANA_CHAIN_ID : ROBINHOOD_CHAIN_ID;
}

export function deskOf(world: World, chainId: number) {
  return DESKS.find((d) => d.world === world && d.chainId === chainId) ?? DESKS[0]!;
}

export function chainLabel(chainId: number) {
  return chainId === SOLANA_CHAIN_ID ? "Solana" : "Robinhood Chain";
}

export function cashTokenId(world: World, chainId: number): string {
  const desk = deskOf(world, chainId);
  return desk.cash === "USDC" ? `USDC:${SOLANA_CHAIN_ID}` : "USDG";
}

export function isSolanaChain(chainId: number) {
  return chainId === SOLANA_CHAIN_ID;
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
