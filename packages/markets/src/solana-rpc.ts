import { LIMITS, waitToken } from "./limiter.js";
import { breakerFail, breakerOk, breakerSuccess } from "./breaker.js";

function rpcUrls(): string[] {
  const extra = String(process.env.SOLANA_RPC_URLS ?? "")
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const primary = process.env.SOLANA_RPC_URL?.trim();
  return [...new Set([primary, ...extra, "https://api.mainnet-beta.solana.com"].filter(Boolean) as string[])];
}

export async function solanaRpc<T>(method: string, params: unknown[]): Promise<T | null> {
  if (!breakerOk("solana")) return null;
  if (!(await waitToken("solana", LIMITS.solana.rps, LIMITS.solana.burst))) return null;
  for (const url of rpcUrls()) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params })
      });
      if (!res.ok) {
        breakerFail("solana");
        continue;
      }
      const body = (await res.json()) as { result?: T; error?: { message?: string } };
      if (body.error) {
        breakerFail("solana");
        continue;
      }
      breakerSuccess("solana");
      return body.result ?? null;
    } catch {
      breakerFail("solana");
    }
  }
  return null;
}

export async function getMultipleAccounts(pks: string[]): Promise<Array<{ pubkey: string; data: string | null }>> {
  const out: Array<{ pubkey: string; data: string | null }> = [];
  for (let i = 0; i < pks.length; i += 100) {
    const batch = pks.slice(i, i + 100);
    const result = await solanaRpc<{ value?: Array<{ data?: [string, string] } | null> }>("getMultipleAccounts", [
      batch,
      { encoding: "base64" }
    ]);
    (result?.value ?? []).forEach((row, idx) => {
      out.push({ pubkey: batch[idx] ?? "", data: row?.data?.[0] ?? null });
    });
  }
  return out;
}

export async function getBalanceLamports(address: string): Promise<number | null> {
  const n = await solanaRpc<number>("getBalance", [address, { commitment: "confirmed" }]);
  return typeof n === "number" ? n : (n as { value?: number } | null)?.value ?? null;
}

export function tokenBalanceDelta(
  meta: {
    preTokenBalances?: Array<{ mint: string; owner: string; uiTokenAmount?: { amount?: string } }>;
    postTokenBalances?: Array<{ mint: string; owner: string; uiTokenAmount?: { amount?: string } }>;
  } | null | undefined,
  owner: string,
  mint: string
): bigint {
  const pre = meta?.preTokenBalances?.find((b) => b.owner === owner && b.mint === mint);
  const post = meta?.postTokenBalances?.find((b) => b.owner === owner && b.mint === mint);
  const a = BigInt(post?.uiTokenAmount?.amount ?? "0");
  const b = BigInt(pre?.uiTokenAmount?.amount ?? "0");
  return a - b;
}

export async function sendTransaction(b64: string): Promise<string | null> {
  const sig = await solanaRpc<string>("sendTransaction", [b64, { encoding: "base64", skipPreflight: false }]);
  return sig ?? null;
}

export async function signatureStatus(sig: string): Promise<{ confirmed: boolean; err: unknown } | null> {
  const row = await solanaRpc<{ value?: Array<{ confirmationStatus?: string; err?: unknown } | null> }>(
    "getSignatureStatuses",
    [[sig], { searchTransactionHistory: true }]
  );
  const v = row?.value?.[0];
  if (!v) return null;
  return { confirmed: v.confirmationStatus === "confirmed" || v.confirmationStatus === "finalized", err: v.err };
}

export async function simulateTransaction(b64: string): Promise<{ ok: boolean; err?: string }> {
  const row = await solanaRpc<{ value?: { err?: unknown; logs?: string[] } }>("simulateTransaction", [
    b64,
    { encoding: "base64", sigVerify: false, replaceRecentBlockhash: true }
  ]);
  if (!row) return { ok: false, err: "no_sim" };
  if (row.value?.err) return { ok: false, err: JSON.stringify(row.value.err).slice(0, 120) };
  return { ok: true };
}

export async function getTransaction(sig: string) {
  return solanaRpc<{
    meta?: {
      preTokenBalances?: Array<{ mint: string; owner: string; uiTokenAmount?: { amount?: string; decimals?: number } }>;
      postTokenBalances?: Array<{ mint: string; owner: string; uiTokenAmount?: { amount?: string; decimals?: number } }>;
      err?: unknown;
    };
  }>("getTransaction", [sig, { encoding: "jsonParsed", maxSupportedTransactionVersion: 0 }]);
}
