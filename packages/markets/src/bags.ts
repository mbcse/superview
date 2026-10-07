import { ROBINHOOD_CHAIN_ID, SOLANA_CHAIN_ID, sanitizeCatalogText } from "@takeandstake/shared";
import { bagsHeaders, providerFetch } from "./http.js";
import type { SwapQuote, SwapReq } from "./types.js";

const BAGS = "https://public-api-v2.bags.fm/api/v1";

export type BagsLaunch = {
  mint: string;
  name: string;
  symbol: string;
  image?: string;
  status?: string;
  chainId: number;
  createdAt?: string;
};

function unwrap<T>(body: unknown): T | null {
  if (!body || typeof body !== "object") return null;
  const r = body as { success?: boolean; response?: T };
  return (r.response ?? body) as T;
}

export async function bagsLaunchFeed(): Promise<BagsLaunch[]> {
  const res = await providerFetch("bags", `${BAGS}/token-launch/feed`, { headers: bagsHeaders() });
  if (!res?.ok) return [];
  const raw = unwrap<unknown>(await res.json());
  const rows = Array.isArray(raw) ? raw : (raw as { items?: unknown[] })?.items ?? [];
  return rows.flatMap((row) => {
    const r = row as {
      tokenMint?: string;
      mint?: string;
      name?: string;
      symbol?: string;
      image?: string;
      status?: string;
      createdAt?: string;
      chain?: string;
    };
    const mint = String(r.tokenMint ?? r.mint ?? "");
    if (!mint) return [];
    return [
      {
        mint,
        name: sanitizeCatalogText(String(r.name ?? r.symbol ?? mint), 80),
        symbol: String(r.symbol ?? "BAGS").toUpperCase().slice(0, 16),
        image: r.image,
        status: r.status,
        chainId: /evm|robinhood|4663/i.test(String(r.chain ?? "")) ? ROBINHOOD_CHAIN_ID : SOLANA_CHAIN_ID,
        createdAt: r.createdAt
      }
    ];
  });
}

export async function bagsTradeQuote(req: SwapReq): Promise<SwapQuote | null> {
  const res = await providerFetch("bags", `${BAGS}/trade/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", ...bagsHeaders() },
    body: JSON.stringify({
      mint: req.asset.contractAddress,
      side: req.side.toLowerCase(),
      amountUsd: req.amountUsd,
      user: req.owner
    })
  });
  if (!res?.ok) return null;
  const raw = unwrap<{ inAmount?: string; outAmount?: string; priceImpact?: number }>(await res.json());
  if (!raw?.outAmount) return null;
  return {
    inMint: req.side === "BUY" ? "USDC" : req.asset.contractAddress,
    outMint: req.side === "BUY" ? req.asset.contractAddress : "USDC",
    inAmount: String(raw.inAmount ?? ""),
    outAmount: String(raw.outAmount),
    priceImpact: Number(raw.priceImpact ?? 0),
    route: "BAGS",
    raw
  };
}

export async function bagsSwapTx(quote: SwapQuote, owner: string): Promise<string | null> {
  const res = await providerFetch("bags", `${BAGS}/trade/transaction`, {
    method: "POST",
    headers: { "content-type": "application/json", ...bagsHeaders() },
    body: JSON.stringify({ quote: quote.raw, user: owner })
  });
  if (!res?.ok) return null;
  const raw = unwrap<{ transaction?: string; swapTransaction?: string }>(await res.json());
  return raw?.transaction ?? raw?.swapTransaction ?? null;
}
