import { pctToFraction, SOL_MINT, USDC_SOLANA_MINT } from "@takeandstake/shared";
import { bagsHeaders, jupiterHeaders, providerFetch } from "./http.js";
import { jupiterPriceBook, jupiterSwapQuoteRow, parseJson } from "./parse.js";
import type { AssetRef, Quote, RiskFlags, SwapQuote, SwapReq } from "./types.js";

export async function jupiterPrices(mints: string[]): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  const unique = [...new Set(mints.filter(Boolean))];
  for (let i = 0; i < unique.length; i += 50) {
    const batch = unique.slice(i, i + 50);
    const res = await providerFetch(
      "jupiter",
      `https://api.jup.ag/price/v3?ids=${batch.join(",")}`,
      { headers: jupiterHeaders() }
    );
    if (!res?.ok) continue;
    const body = parseJson(jupiterPriceBook, await res.json()) ?? {};
    const now = Date.now();
    for (const [mint, row] of Object.entries(body ?? {})) {
      const last = Number(row?.usdPrice);
      if (!Number.isFinite(last) || last <= 0) continue;
      out.set(mint, {
        assetId: mint,
        last,
        chg: pctToFraction(row.priceChange24h ?? null),
        liquidityUsd: Number.isFinite(Number(row.liquidity)) ? Number(row.liquidity) : null,
        observedAt: now,
        provider: "JUPITER",
        halt: false
      });
    }
  }
  return out;
}

export type JupiterTokenInfo = {
  id: string;
  symbol: string;
  name: string;
  icon?: string;
  decimals: number;
  launchpad?: string | null;
  graduatedAt?: string | null;
  holderCount?: number | null;
  liquidity?: number | null;
  mcap?: number | null;
  createdAt?: string | null;
  audit?: {
    isSus?: boolean;
    mintAuthorityDisabled?: boolean;
    freezeAuthorityDisabled?: boolean;
    topHoldersPercentage?: number;
    devBalancePercentage?: number;
  } | null;
  organicScore?: number | null;
  isVerified?: boolean | null;
  tags?: string[] | null;
};

export async function jupiterSearch(query: string): Promise<JupiterTokenInfo[]> {
  const res = await providerFetch(
    "jupiter",
    `https://api.jup.ag/tokens/v2/search?query=${encodeURIComponent(query)}`,
    { headers: jupiterHeaders() }
  );
  if (!res?.ok) return [];
  const body = (await res.json()) as JupiterTokenInfo[];
  return Array.isArray(body) ? body : [];
}

export function riskFromJupiter(row: JupiterTokenInfo): RiskFlags {
  return {
    mintAuthorityDisabled: row.audit?.mintAuthorityDisabled,
    freezeAuthorityDisabled: row.audit?.freezeAuthorityDisabled,
    topHolders: pctToFraction(row.audit?.topHoldersPercentage ?? null),
    devBalance: pctToFraction(row.audit?.devBalancePercentage ?? null),
    isSus: Boolean(row.audit?.isSus),
    organicScore: row.organicScore ?? null
  };
}

export async function jupiterSwapQuote(req: SwapReq): Promise<SwapQuote | null> {
  const mint = req.asset.contractAddress;
  const buy = req.side === "BUY";
  const inputMint = buy ? USDC_SOLANA_MINT : mint;
  const outputMint = buy ? mint : USDC_SOLANA_MINT;
  const amount = buy
    ? String(Math.round(req.amountUsd * 1_000_000))
    : String(Math.max(1, Math.floor(req.amountUsd / Math.max(0.000001, 1) * 10 ** req.asset.decimals)));
  const slip = req.slippageBps ?? 100;
  const url = `https://api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slip}`;
  const res = await providerFetch("jupiterLive", url, { headers: jupiterHeaders() });
  if (!res?.ok) return null;
  const raw = parseJson(jupiterSwapQuoteRow, await res.json());
  if (!raw?.outAmount) return null;
  return {
    inMint: inputMint,
    outMint: outputMint,
    inAmount: String(raw.inAmount ?? amount),
    outAmount: String(raw.outAmount),
    priceImpact: Math.abs(Number(raw.priceImpactPct ?? 0)) > 1.5
      ? Math.abs(Number(raw.priceImpactPct)) / 100
      : Math.abs(Number(raw.priceImpactPct ?? 0)),
    route: "JUPITER",
    raw
  };
}

export async function jupiterSwapTx(quote: SwapQuote, userPublicKey: string): Promise<string | null> {
  const res = await providerFetch("jupiterLive", "https://api.jup.ag/swap/v1/swap", {
    method: "POST",
    headers: { "content-type": "application/json", ...jupiterHeaders() },
    body: JSON.stringify({
      quoteResponse: quote.raw,
      userPublicKey,
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true
    })
  });
  if (!res?.ok) return null;
  const body = (await res.json()) as { swapTransaction?: string };
  return body.swapTransaction ?? null;
}

void bagsHeaders;
void SOL_MINT;
