import {
  MONAD_CHAIN_ID,
  SOLANA_CHAIN_ID,
  normalizeTokenAddress,
  sameIssuerListing,
  sanitizeCatalogText,
  underlyingTicker
} from "@takeandstake/shared";
import { providerFetch } from "./http.js";

export type XStockNetwork = "Solana" | "Monad";

const NETWORK_CHAIN: Record<XStockNetwork, number> = {
  Solana: SOLANA_CHAIN_ID,
  Monad: MONAD_CHAIN_ID
};

export type XStockAsset = {
  symbol: string;
  name: string;
  isin?: string;
  logo?: string;
  isTradingHalted?: boolean;
  mint?: string;
  decimals?: number;
};

type XStockNode = {
  symbol?: string;
  name?: string;
  isTradingHalted?: boolean;
  logo?: string;
  isin?: string;
  underlying?: { isin?: string };
  deployments?: Array<{ network?: string; address?: string; decimals?: number | null }>;
};

/** Names the list endpoint often omits on early pages. */
export const CORE_XSTOCKS = [
  "AAPLx",
  "NVDAx",
  "TSLAx",
  "MSFTx",
  "GOOGLx",
  "AMZNx",
  "METAx",
  "SPYx",
  "QQQx",
  "NFLXx",
  "AMDx",
  "AVGOx",
  "COINx",
  "PLTRx",
  "HOODx",
  "MSTRx",
  "CRWDx",
  "INTCx",
  "ORCLx",
  "SLVx"
];

export function parseXStockNode(row: XStockNode, network: XStockNetwork = "Solana"): XStockAsset | null {
  const chainId = NETWORK_CHAIN[network];
  const want = new RegExp(`^${network}$`, "i");
  const dep = (row.deployments ?? []).find((d) => want.test(String(d.network ?? "")));
  const mint = normalizeTokenAddress(String(dep?.address ?? ""), chainId);
  const symbol = String(row.symbol ?? "").trim();
  if (!symbol || !mint || !underlyingTicker(symbol, "XSTOCKS")) return null;
  return {
    symbol,
    name: sanitizeCatalogText(String(row.name ?? symbol), 80),
    isin: row.underlying?.isin ?? row.isin,
    logo: row.logo,
    isTradingHalted: Boolean(row.isTradingHalted),
    mint,
    decimals: dep?.decimals ?? 6
  };
}

async function fetchXStock(symbol: string, network: XStockNetwork = "Solana"): Promise<XStockAsset | null> {
  const res = await providerFetch("xstocks", `https://api.xstocks.fi/api/v2/public/assets/${encodeURIComponent(symbol)}`);
  if (!res?.ok) return null;
  return parseXStockNode((await res.json()) as XStockNode, network);
}

export async function listXStocks(network: XStockNetwork = "Solana"): Promise<XStockAsset[]> {
  const byMint = new Map<string, XStockAsset>();
  for (let page = 0; page < 20; page++) {
    const res = await providerFetch(
      "xstocks",
      `https://api.xstocks.fi/api/v2/public/assets?network=${encodeURIComponent(network)}&pageSize=100&page=${page}`
    );
    if (!res?.ok) break;
    const body = (await res.json()) as { nodes?: XStockNode[]; page?: { hasNextPage?: boolean } };
    for (const row of body.nodes ?? []) {
      const parsed = parseXStockNode(row, network);
      if (parsed?.mint) byMint.set(parsed.mint, parsed);
    }
    if (!body.page?.hasNextPage) break;
  }
  const have = new Set([...byMint.values()].map((a) => a.symbol.toUpperCase()));
  for (const symbol of CORE_XSTOCKS) {
    if (have.has(symbol.toUpperCase())) continue;
    const extra = await fetchXStock(symbol, network);
    if (extra?.mint) {
      byMint.set(extra.mint, extra);
      have.add(extra.symbol.toUpperCase());
    }
  }
  return [...byMint.values()];
}

export function xstockChainId(network: XStockNetwork = "Solana") {
  return NETWORK_CHAIN[network];
}

export async function xstockBoundPrice(asset: {
  contractAddress: string;
  symbol: string;
  chainId: number;
  xstocksSymbol?: string | null;
  isin?: string | null;
}): Promise<number | null> {
  const network: XStockNetwork | null =
    asset.chainId === MONAD_CHAIN_ID ? "Monad" : asset.chainId === SOLANA_CHAIN_ID ? "Solana" : null;
  if (!network) return null;
  const symbol = asset.xstocksSymbol || asset.symbol;
  const listing = await fetchXStock(symbol, network);
  if (!listing?.mint) return null;
  if (
    !sameIssuerListing(
      { chainId: asset.chainId, address: asset.contractAddress, symbol, source: "XSTOCKS", isin: asset.isin },
      { chainId: asset.chainId, address: listing.mint, symbol: listing.symbol, source: "XSTOCKS", isin: listing.isin }
    )
  ) {
    return null;
  }
  return xstockPrice(listing.symbol);
}

export async function xstockPrice(symbol: string): Promise<number | null> {
  const res = await providerFetch("xstocks", `https://api.xstocks.fi/api/v2/public/assets/${encodeURIComponent(symbol)}/price-data`);
  if (!res?.ok) return null;
  const body = (await res.json()) as { quote?: number; price?: number };
  const n = Number(body.quote ?? body.price);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function xstockMultiplier(symbol: string): Promise<string | null> {
  const res = await providerFetch("xstocks", `https://api.xstocks.fi/api/v2/public/assets/${encodeURIComponent(symbol)}/multiplier`);
  if (!res?.ok) return null;
  const body = (await res.json()) as { current?: string | number; multiplier?: string | number };
  const v = body.current ?? body.multiplier;
  return v == null ? null : String(v);
}

export { MONAD_CHAIN_ID, SOLANA_CHAIN_ID };
