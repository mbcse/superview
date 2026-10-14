import { AUSD_MONAD_ADDRESS, USDC_BASE_ADDRESS } from "@takeandstake/shared";
import { providerFetch } from "./http.js";

const AURORA_BASE = "https://intents-api.aurora.dev";

export type AuroraToken = {
  assetId: string;
  decimals: number;
  blockchain: string;
  symbol: string;
  contractAddress?: string | null;
};

export type AuroraRoute = {
  origin: AuroraToken;
  dest: AuroraToken;
  destIsAusd: boolean;
};

export type AuroraQuote = {
  depositAddress: string;
  amountIn: string;
  amountOut: string;
  destIsAusd: boolean;
  destAddress: string;
};

export type AuroraSwapStatus =
  | "KNOWN_DEPOSIT_TX"
  | "PENDING_DEPOSIT"
  | "INCOMPLETE_DEPOSIT"
  | "PROCESSING"
  | "SUCCESS"
  | "REFUNDED"
  | "FAILED";

function sameAddr(a?: string | null, b?: string | null) {
  return Boolean(a && b && a.toLowerCase() === b.toLowerCase());
}

export function parseAuroraTokens(payload: unknown): AuroraToken[] {
  const root = payload && typeof payload === "object" ? (payload as { tokens?: unknown }) : null;
  if (!Array.isArray(root?.tokens)) return [];
  const out: AuroraToken[] = [];
  for (const row of root.tokens) {
    if (!row || typeof row !== "object") continue;
    const t = row as Record<string, unknown>;
    const assetId = String(t.assetId ?? t.asset_id ?? t.token_id ?? "");
    const blockchain = String(t.blockchain ?? t.chain ?? "").toLowerCase();
    const symbol = String(t.symbol ?? "").toUpperCase();
    const decimals = Number(t.decimals ?? 6);
    if (!assetId || !blockchain || !symbol) continue;
    const contractAddress =
      typeof t.contractAddress === "string"
        ? t.contractAddress
        : typeof t.contract_address === "string"
          ? t.contract_address
          : null;
    out.push({ assetId, decimals: Number.isFinite(decimals) ? decimals : 6, blockchain, symbol, contractAddress });
  }
  return out;
}

export function resolveMonadCashRoute(
  tokens: AuroraToken[],
  ausdAddress = AUSD_MONAD_ADDRESS
): AuroraRoute | null {
  const origin =
    tokens.find((t) => t.blockchain === "base" && t.symbol === "USDC" && sameAddr(t.contractAddress, USDC_BASE_ADDRESS)) ??
    tokens.find((t) => t.blockchain === "base" && t.symbol === "USDC");
  if (!origin) return null;
  const monad = tokens.filter((t) => t.blockchain === "monad");
  const ausd = monad.find((t) => sameAddr(t.contractAddress, ausdAddress)) ?? monad.find((t) => t.symbol === "AUSD");
  const usdc = monad.find((t) => t.symbol === "USDC");
  const dest = ausd ?? usdc ?? null;
  if (!dest) return null;
  return { origin, dest, destIsAusd: Boolean(ausd) };
}

export async function auroraListTokens(apiKey: string): Promise<AuroraToken[]> {
  const res = await providerFetch("aurora", `${AURORA_BASE}/api/tokens/${apiKey}`);
  if (!res?.ok) return [];
  return parseAuroraTokens(await res.json());
}

export async function auroraQuote(opts: {
  apiKey: string;
  originAsset: string;
  destinationAsset: string;
  amount: string;
  recipient: string;
  refundTo: string;
  swapType?: "EXACT_INPUT" | "EXACT_OUTPUT";
}): Promise<{ depositAddress: string; amountIn: string; amountOut: string } | null> {
  const res = await providerFetch("aurora", `${AURORA_BASE}/api/quote/${opts.apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      dry: false,
      swapType: opts.swapType ?? "EXACT_OUTPUT",
      depositType: "ORIGIN_CHAIN",
      originAsset: opts.originAsset,
      destinationAsset: opts.destinationAsset,
      amount: opts.amount,
      slippageTolerance: 100,
      refundTo: opts.refundTo,
      refundType: "ORIGIN_CHAIN",
      recipient: opts.recipient,
      recipientType: "DESTINATION_CHAIN"
    })
  });
  if (!res?.ok) return null;
  const body = (await res.json()) as {
    quote?: { depositAddress?: string; amountIn?: string; amountOut?: string };
  };
  const depositAddress = body.quote?.depositAddress;
  const amountIn = body.quote?.amountIn;
  const amountOut = body.quote?.amountOut;
  if (!depositAddress || !amountIn || !amountOut) return null;
  return { depositAddress, amountIn, amountOut };
}

export async function auroraSubmitDeposit(opts: { apiKey: string; txHash: string; depositAddress: string }) {
  await providerFetch("aurora", `${AURORA_BASE}/api/deposit/submit/${opts.apiKey}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ txHash: opts.txHash, depositAddress: opts.depositAddress })
  });
}

export function parseAuroraStatus(payload: unknown): AuroraSwapStatus | null {
  if (!payload || typeof payload !== "object") return null;
  const status = String((payload as { status?: unknown }).status ?? "");
  if (
    status === "KNOWN_DEPOSIT_TX" ||
    status === "PENDING_DEPOSIT" ||
    status === "INCOMPLETE_DEPOSIT" ||
    status === "PROCESSING" ||
    status === "SUCCESS" ||
    status === "REFUNDED" ||
    status === "FAILED"
  ) {
    return status;
  }
  return null;
}

export function auroraDestTxHash(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const hashes = (payload as { swapDetails?: { destinationChainTxHashes?: Array<{ hash?: string }> } }).swapDetails
    ?.destinationChainTxHashes;
  return hashes?.[0]?.hash ?? null;
}

export async function auroraSwapStatus(apiKey: string, depositAddress: string): Promise<{
  status: AuroraSwapStatus;
  destTxHash: string | null;
} | null> {
  const url = `${AURORA_BASE}/api/status/${apiKey}?depositAddress=${encodeURIComponent(depositAddress)}`;
  const res = await providerFetch("aurora", url);
  if (!res?.ok) return null;
  const body = await res.json();
  const status = parseAuroraStatus(body);
  if (!status) return null;
  return { status, destTxHash: auroraDestTxHash(body) };
}

const TERMINAL = new Set<AuroraSwapStatus>(["SUCCESS", "REFUNDED", "FAILED"]);

export async function auroraPollSwap(
  apiKey: string,
  depositAddress: string,
  opts?: { timeoutMs?: number; intervalMs?: number }
): Promise<{ status: AuroraSwapStatus; destTxHash: string | null } | null> {
  const timeoutMs = opts?.timeoutMs ?? 120_000;
  const intervalMs = opts?.intervalMs ?? 3_000;
  const deadline = Date.now() + timeoutMs;
  let last: { status: AuroraSwapStatus; destTxHash: string | null } | null = null;
  while (Date.now() < deadline) {
    last = await auroraSwapStatus(apiKey, depositAddress);
    if (last && TERMINAL.has(last.status)) return last;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return last;
}

export async function quoteMonadCash(opts: {
  apiKey: string;
  needUsd: number;
  recipient: string;
  refundTo: string;
  ausdAddress?: string;
}): Promise<AuroraQuote | { error: "no_aurora_route" }> {
  const tokens = await auroraListTokens(opts.apiKey);
  const route = resolveMonadCashRoute(tokens, opts.ausdAddress);
  if (!route) return { error: "no_aurora_route" };
  const amount = String(Math.max(1, Math.round(opts.needUsd * 10 ** route.dest.decimals)));
  let quoted = await auroraQuote({
    apiKey: opts.apiKey,
    originAsset: route.origin.assetId,
    destinationAsset: route.dest.assetId,
    amount,
    recipient: opts.recipient,
    refundTo: opts.refundTo,
    swapType: "EXACT_OUTPUT"
  });
  if (!quoted) {
    quoted = await auroraQuote({
      apiKey: opts.apiKey,
      originAsset: route.origin.assetId,
      destinationAsset: route.dest.assetId,
      amount: String(Math.max(1, Math.round(opts.needUsd * 1.02 * 10 ** route.origin.decimals))),
      recipient: opts.recipient,
      refundTo: opts.refundTo,
      swapType: "EXACT_INPUT"
    });
  }
  if (!quoted) return { error: "no_aurora_route" };
  return {
    depositAddress: quoted.depositAddress,
    amountIn: quoted.amountIn,
    amountOut: quoted.amountOut,
    destIsAusd: route.destIsAusd,
    destAddress: route.dest.contractAddress ?? ""
  };
}
