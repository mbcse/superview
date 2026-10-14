import { providerFetch } from "./http.js";

const NANSEN_BASE = "https://api.nansen.ai/api/v1";

export type NansenNote = { line: string };

function nansenKey() {
  return process.env.NANSEN_API_KEY?.trim() ?? "";
}

function num(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function formatNansenNote(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  const data = (row.data && typeof row.data === "object" ? row.data : row) as Record<string, unknown>;
  const holders = num(data.holders ?? data.holderCount ?? data.holder_count);
  const netflow = num(data.netflowUsd ?? data.netFlowUsd ?? data.netflow_usd ?? data.netFlow);
  const smart = num(data.smartMoneyNetflowUsd ?? data.smart_money_netflow_usd ?? data.smartMoneyFlow);
  const parts: string[] = [];
  if (holders != null && holders > 0) parts.push(`${Math.round(holders).toLocaleString("en-US")} holders`);
  if (netflow != null && netflow !== 0) {
    const abs = Math.abs(netflow);
    const label = abs >= 1_000_000 ? `$${(abs / 1_000_000).toFixed(1)}M` : abs >= 1_000 ? `$${(abs / 1_000).toFixed(0)}k` : `$${abs.toFixed(0)}`;
    parts.push(`netflow ${netflow > 0 ? "+" : "−"}${label}`);
  }
  if (smart != null && smart !== 0) {
    parts.push(`smart money ${smart > 0 ? "in" : "out"}`);
  }
  if (!parts.length) return null;
  return `Nansen · ${parts.join(" · ")}`;
}

export async function nansenMonadNote(contractAddress: string): Promise<string | null> {
  const key = nansenKey();
  if (!key || !contractAddress) return null;
  const headers = { "content-type": "application/json", apiKey: key };
  const body = JSON.stringify({ chain: "monad", tokenAddress: contractAddress });
  const holders = await providerFetch("nansen", `${NANSEN_BASE}/tgm/holders`, {
    method: "POST",
    headers,
    body
  });
  const flow = await providerFetch("nansen", `${NANSEN_BASE}/tgm/flow-intelligence`, {
    method: "POST",
    headers,
    body
  });
  const holderJson = holders?.ok ? await holders.json().catch(() => null) : null;
  const flowJson = flow?.ok ? await flow.json().catch(() => null) : null;
  const merged =
    holderJson && flowJson && typeof holderJson === "object" && typeof flowJson === "object"
      ? { ...(holderJson as object), ...(flowJson as object) }
      : (flowJson ?? holderJson);
  return formatNansenNote(merged);
}
