import { AUSD_MONAD_ADDRESS, MONAD_CHAIN_ID } from "@takeandstake/shared";
import { providerFetch } from "./http.js";
import type { SwapQuote, SwapReq } from "./types.js";

function flowBase() {
  return (process.env.KURU_FLOW_URL || "https://ws.kuru.io").replace(/\/$/, "");
}

async function flowToken(): Promise<string | null> {
  const res = await providerFetch("kuru", `${flowBase()}/api/generate-token`, { method: "POST" });
  if (!res?.ok) return null;
  const body = (await res.json()) as { token?: string };
  return body.token ?? null;
}

export function kuruBuiltTx(raw: unknown): { to: string; data: string; value?: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;
  const nested =
    row.transaction && typeof row.transaction === "object"
      ? (row.transaction as Record<string, unknown>)
      : row.tx && typeof row.tx === "object"
        ? (row.tx as Record<string, unknown>)
        : row;
  const to = typeof nested.to === "string" ? nested.to : typeof row.to === "string" ? row.to : "";
  const data = typeof nested.data === "string" ? nested.data : typeof row.calldata === "string" ? row.calldata : "";
  if (!to || !data) return null;
  const value = typeof nested.value === "string" ? nested.value : typeof row.value === "string" ? row.value : undefined;
  return { to, data, value };
}

export async function kuruFlowPairQuote(opts: {
  sellToken: string;
  buyToken: string;
  sellAmount: string;
}): Promise<SwapQuote | null> {
  const token = await flowToken();
  if (!token) return null;
  const res = await providerFetch("kuru", `${flowBase()}/api/quote`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify({
      chainId: MONAD_CHAIN_ID,
      sellToken: opts.sellToken,
      buyToken: opts.buyToken,
      sellAmount: opts.sellAmount
    })
  });
  if (!res?.ok) return null;
  const raw = (await res.json()) as {
    inAmount?: string;
    outAmount?: string;
    buyAmount?: string;
    sellAmount?: string;
    priceImpact?: number;
  };
  const outAmount = raw.outAmount ?? raw.buyAmount;
  const inAmount = raw.inAmount ?? raw.sellAmount ?? opts.sellAmount;
  if (!outAmount || Number(outAmount) <= 0) return null;
  return {
    inMint: opts.sellToken,
    outMint: opts.buyToken,
    inAmount: String(inAmount),
    outAmount: String(outAmount),
    priceImpact: Number(raw.priceImpact ?? 0),
    route: "KURU_FLOW",
    raw
  };
}

export async function kuruFlowQuote(req: SwapReq): Promise<SwapQuote | null> {
  const sell = req.side === "BUY" ? AUSD_MONAD_ADDRESS : req.asset.contractAddress;
  const buy = req.side === "BUY" ? req.asset.contractAddress : AUSD_MONAD_ADDRESS;
  const amount =
    req.sellAmount ??
    (req.side === "BUY"
      ? String(Math.round(req.amountUsd * 1e6))
      : String(Math.round(req.amountUsd * 10 ** req.asset.decimals)));
  return kuruFlowPairQuote({ sellToken: sell, buyToken: buy, sellAmount: amount });
}
