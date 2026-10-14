export const ROBINHOOD_CHAIN_ID = 4663;
export const SOLANA_CHAIN_ID = 101;
export const BASE_CHAIN_ID = 8453;
export const MONAD_CHAIN_ID = 143;
export const SOLANA_CAIP2 = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";

export const PAPER_USD_TOKEN_ID = "USD";
export const PAPER_USD_DECIMALS = 6;

export const USDC_SOLANA_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDG_ADDRESS = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
export const USDC_BASE_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
/** Agora AUSD (LayerZero OFT). Override with AUSD_MONAD_ADDRESS if the mint moves. */
export const AUSD_MONAD_ADDRESS = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a";

export type CashSymbol = "USDG" | "USDC" | "AUSD";
export type Benchmark = "SPY" | "SOL";
export type ChainKind = "evm" | "solana";
export type ExecutorKey = "robinhood" | "solana" | "base" | "monad";

export type CashToken = {
  symbol: CashSymbol;
  address: string;
  decimals: number;
  tokenId: string;
};

export type ChainDef = {
  id: number;
  label: string;
  kind: ChainKind;
  cash: CashToken;
  explorer: { name: string; tx: (hash: string) => string };
  rpcEnv: string;
  extraRpcEnv: string;
  defaultRpcs: readonly string[];
  executor: ExecutorKey;
  liveFlag: string;
  restrictedCountries: readonly string[];
  logo: string;
  caip2: string;
};

const STOCK_RESTRICTED = ["US", "GB", "CA", "CH", "AE"] as const;

export const CHAINS: Record<number, ChainDef> = {
  [ROBINHOOD_CHAIN_ID]: {
    id: ROBINHOOD_CHAIN_ID,
    label: "Robinhood Chain",
    kind: "evm",
    cash: { symbol: "USDG", address: USDG_ADDRESS, decimals: 6, tokenId: "USDG" },
    explorer: {
      name: "Blockscout",
      tx: (hash) => `https://robinhoodchain.blockscout.com/tx/${hash}`
    },
    rpcEnv: "ROBINHOOD_RPC_URL",
    extraRpcEnv: "ROBINHOOD_RPC_URLS",
    defaultRpcs: [
      "https://rpc.mainnet.chain.robinhood.com",
      "https://sequencer.mainnet.chain.robinhood.com",
      "https://triport.io/rpc/robinhood/public"
    ],
    executor: "robinhood",
    liveFlag: "live_trading",
    restrictedCountries: STOCK_RESTRICTED,
    logo: "rh",
    caip2: `eip155:${ROBINHOOD_CHAIN_ID}`
  },
  [SOLANA_CHAIN_ID]: {
    id: SOLANA_CHAIN_ID,
    label: "Solana",
    kind: "solana",
    cash: { symbol: "USDC", address: USDC_SOLANA_MINT, decimals: 6, tokenId: `USDC:${SOLANA_CHAIN_ID}` },
    explorer: {
      name: "Solscan",
      tx: (hash) => `https://solscan.io/tx/${hash}`
    },
    rpcEnv: "SOLANA_RPC_URL",
    extraRpcEnv: "SOLANA_RPC_URLS",
    defaultRpcs: ["https://api.mainnet-beta.solana.com"],
    executor: "solana",
    liveFlag: "live_trading_xstocks",
    restrictedCountries: STOCK_RESTRICTED,
    logo: "sol",
    caip2: SOLANA_CAIP2
  },
  [BASE_CHAIN_ID]: {
    id: BASE_CHAIN_ID,
    label: "Base",
    kind: "evm",
    cash: { symbol: "USDC", address: USDC_BASE_ADDRESS, decimals: 6, tokenId: `USDC:${BASE_CHAIN_ID}` },
    explorer: {
      name: "Basescan",
      tx: (hash) => `https://basescan.org/tx/${hash}`
    },
    rpcEnv: "BASE_RPC_URL",
    extraRpcEnv: "BASE_RPC_URLS",
    defaultRpcs: ["https://mainnet.base.org"],
    executor: "base",
    liveFlag: "live_trading_base",
    restrictedCountries: STOCK_RESTRICTED,
    logo: "base",
    caip2: `eip155:${BASE_CHAIN_ID}`
  },
  [MONAD_CHAIN_ID]: {
    id: MONAD_CHAIN_ID,
    label: "Monad",
    kind: "evm",
    cash: { symbol: "AUSD", address: AUSD_MONAD_ADDRESS, decimals: 6, tokenId: `AUSD:${MONAD_CHAIN_ID}` },
    explorer: {
      name: "Monadvision",
      tx: (hash) => `https://monadvision.com/tx/${hash}`
    },
    rpcEnv: "MONAD_RPC_URL",
    extraRpcEnv: "MONAD_RPC_URLS",
    defaultRpcs: ["https://rpc.monad.xyz"],
    executor: "monad",
    liveFlag: "live_trading_monad",
    restrictedCountries: STOCK_RESTRICTED,
    logo: "monad",
    caip2: `eip155:${MONAD_CHAIN_ID}`
  }
};

export const CHAIN_IDS = [ROBINHOOD_CHAIN_ID, SOLANA_CHAIN_ID, BASE_CHAIN_ID, MONAD_CHAIN_ID] as const;
export type KnownChainId = (typeof CHAIN_IDS)[number];

export function isKnownChainId(chainId: number): chainId is KnownChainId {
  return chainId in CHAINS;
}

export function chainOf(chainId: number): ChainDef {
  const chain = CHAINS[chainId];
  if (!chain) throw new Error(`unknown_chain:${chainId}`);
  return chain;
}

export function chainOfOrNull(chainId: number | null | undefined): ChainDef | null {
  if (chainId == null) return null;
  return CHAINS[chainId] ?? null;
}

export function chainLabel(chainId: number): string {
  return chainOfOrNull(chainId)?.label ?? `Chain ${chainId}`;
}

export function isSolanaChain(chainId: number): boolean {
  return chainOfOrNull(chainId)?.kind === "solana";
}

export function isEvmChain(chainId: number): boolean {
  return chainOfOrNull(chainId)?.kind === "evm";
}

export function explorerTx(chainId: number, hash: string): string {
  return chainOf(chainId).explorer.tx(hash);
}

export function cashTokenIdForChain(chainId: number): string {
  return chainOf(chainId).cash.tokenId;
}

export function liveFlagForChain(chainId: number, world: "STOCKS" | "MEMES" = "STOCKS"): string {
  if (world === "MEMES") {
    return chainId === ROBINHOOD_CHAIN_ID ? "live_rh_bags" : "live_trading_memes";
  }
  return chainOf(chainId).liveFlag;
}

export function executorFor(chainId: number): ExecutorKey {
  return chainOf(chainId).executor;
}

/** User-facing live cash. Privy deposit and exact_output bridges start here. */
export const HOME_CASH_CHAIN_ID = BASE_CHAIN_ID;

export function privyChainAlias(chainId: number): "base" | "solana" | "robinhood" | null {
  if (chainId === BASE_CHAIN_ID) return "base";
  if (chainId === SOLANA_CHAIN_ID) return "solana";
  if (chainId === ROBINHOOD_CHAIN_ID) return "robinhood";
  return null;
}

export function privyCashAsset(chainId: number): "usdc" | "usdg" | null {
  if (chainId === BASE_CHAIN_ID || chainId === SOLANA_CHAIN_ID) return "usdc";
  if (chainId === ROBINHOOD_CHAIN_ID) return "usdg";
  return null;
}

export function isHomeCashSymbol(symbol: string, chainId: number) {
  return (chainId === BASE_CHAIN_ID || chainId === SOLANA_CHAIN_ID) && symbol.toUpperCase() === "USDC";
}

export function canPrivyBridgeTo(chainId: number) {
  return privyChainAlias(chainId) != null && privyCashAsset(chainId) != null;
}
