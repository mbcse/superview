import type { AssetSource, Venue, World } from "@takeandstake/shared";

export type PriceSource =
  | "CHAINLINK"
  | "RH_REST"
  | "XSTOCKS"
  | "JUPITER"
  | "BAGS"
  | "PUMPFUN"
  | "DEXSCREENER";

export type Desk = { world: World; chainId: number };

export type AssetRef = {
  id: string;
  symbol: string;
  chainId: number;
  contractAddress: string;
  decimals: number;
  source?: AssetSource;
  venue?: Venue;
  world?: World;
  xstocksSymbol?: string | null;
  currentMultiplier?: string | null;
};

export type Quote = {
  assetId: string;
  last: number;
  chg: number | null;
  liquidityUsd: number | null;
  observedAt: number;
  provider: PriceSource;
  halt: boolean;
};

export type SwapReq = {
  asset: AssetRef;
  side: "BUY" | "SELL";
  amountUsd: number;
  owner: string;
  slippageBps?: number;
};

export type SwapQuote = {
  inMint: string;
  outMint: string;
  inAmount: string;
  outAmount: string;
  priceImpact: number;
  route: string;
  raw: unknown;
};

export type RiskFlags = {
  mintAuthorityDisabled?: boolean;
  freezeAuthorityDisabled?: boolean;
  topHolders?: number | null;
  devBalance?: number | null;
  isSus?: boolean;
  organicScore?: number | null;
  token2022Risk?: string[];
  noExit?: boolean;
};
