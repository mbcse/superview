import { SOLANA_CHAIN_ID, sanitizeCatalogText } from "@takeandstake/shared";
import { providerFetch } from "./http.js";

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

function fromNode(row: XStockNode): XStockAsset | null {
  const dep = (row.deployments ?? []).find((d) => /solana/i.test(String(d.network ?? "")));
  if (!row.symbol || !dep?.address) return null;
  return {
    symbol: String(row.symbol),
    name: sanitizeCatalogText(String(row.name ?? row.symbol), 80),
    isin: row.underlying?.isin ?? row.isin,
    logo: row.logo,
    isTradingHalted: Boolean(row.isTradingHalted),
    mint: dep.address,
    decimals: dep.decimals ?? 6
  };
}

async function fetchXStock(symbol: string): Promise<XStockAsset | null> {
  const res = await providerFetch("xstocks", `https://api.xstocks.fi/api/v2/public/assets/${encodeURIComponent(symbol)}`);
  if (!res?.ok) return null;
  return fromNode((await res.json()) as XStockNode);
}

export async function listXStocks(): Promise<XStockAsset[]> {
  const byMint = new Map<string, XStockAsset>();
  for (let page = 0; page < 20; page++) {
    const res = await providerFetch(
      "xstocks",
      `https://api.xstocks.fi/api/v2/public/assets?network=Solana&pageSize=100&page=${page}`
    );
    if (!res?.ok) break;
    const body = (await res.json()) as { nodes?: XStockNode[]; page?: { hasNextPage?: boolean } };
    for (const row of body.nodes ?? []) {
      const parsed = fromNode(row);
      if (parsed?.mint) byMint.set(parsed.mint, parsed);
    }
    if (!body.page?.hasNextPage) break;
  }
  const have = new Set([...byMint.values()].map((a) => a.symbol.toUpperCase()));
  for (const symbol of CORE_XSTOCKS) {
    if (have.has(symbol.toUpperCase())) continue;
    const extra = await fetchXStock(symbol);
    if (extra?.mint) {
      byMint.set(extra.mint, extra);
      have.add(extra.symbol.toUpperCase());
    }
  }
  return [...byMint.values()];
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

export { SOLANA_CHAIN_ID };
