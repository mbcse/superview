import { useEffect } from "react";
import { useQuoteBook, watchSymbol } from "@/components/social/price-stream";

export type VsHolding = {
  symbol: string;
  weightBps: number;
  last?: number | null;
  publish?: number | null;
};

type Quote = { last?: number | null; tokenLast?: number | null; chgPct?: number | null };

function quoteOf(quotes: Record<string, Quote>, symbol: string) {
  const u = symbol.toUpperCase();
  const bare = u.replace(/^RH/, "");
  return quotes[u] ?? quotes[`RH${bare}`] ?? quotes[bare] ?? null;
}

function finite(value: unknown): number | null {
  if (value == null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function asSharePrice(price: unknown, share: unknown, token: unknown) {
  const p = finite(price);
  const s = finite(share);
  const t = finite(token);
  if (p == null) return null;
  if (s == null || t == null || !(s > 0) || !(t > 0)) return p;
  const ratio = s / t;
  if (!Number.isFinite(ratio) || Math.abs(ratio - 1) < 0.02) return p;
  if (Math.abs(p - t) <= Math.abs(p - s)) return p * ratio;
  return p;
}

export function liveVsSpy(
  holdings: VsHolding[],
  quotes: Record<string, Quote>,
  spyPublish: number | null | undefined,
  storedBenchmark: number | null | undefined,
  fallback: number | null | undefined
) {
  let acc = 0;
  let w = 0;
  for (const h of holdings) {
    const q = quoteOf(quotes, h.symbol);
    const last = finite(q?.last) ?? finite(h.last);
    const publish = asSharePrice(h.publish, last, q?.tokenLast);
    if (last == null || publish == null || publish <= 0) continue;
    acc += (h.weightBps / 10_000) * (last / publish);
    w += h.weightBps / 10_000;
  }
  if (w <= 0) return dayVsSpy(holdings, quotes) ?? fallback ?? null;
  const index = 100 * (acc / w);
  const spyQ = quoteOf(quotes, "SPY") ?? quoteOf(quotes, "RHSPY");
  const spyLast = spyQ?.last ?? null;
  const spyPub = asSharePrice(spyPublish, spyLast, spyQ?.tokenLast);
  const since =
    spyLast != null && spyPub != null && spyPub > 0
      ? index - 100 * (spyLast / spyPub)
      : storedBenchmark != null
        ? index - storedBenchmark
        : fallback ?? null;
  if (since != null && Math.abs(since) >= 0.005) return since;
  return dayVsSpy(holdings, quotes) ?? since ?? fallback ?? null;
}

function dayVsSpy(holdings: VsHolding[], quotes: Record<string, Quote>) {
  let acc = 0;
  let w = 0;
  for (const h of holdings) {
    const pct = finite(quoteOf(quotes, h.symbol)?.chgPct);
    if (pct == null) continue;
    acc += (h.weightBps / 10_000) * pct;
    w += h.weightBps / 10_000;
  }
  const spy = finite(quoteOf(quotes, "SPY")?.chgPct) ?? finite(quoteOf(quotes, "RHSPY")?.chgPct);
  if (w <= 0 || spy == null) return null;
  return 100 * (acc / w - spy);
}

export function useLiveVsSpy(
  holdings: VsHolding[],
  opts?: { spyPublish?: number | null; storedBenchmark?: number | null; fallback?: number | null }
) {
  const quotes = useQuoteBook();
  const key = holdings.map((h) => `${h.symbol}:${h.weightBps}:${h.publish ?? ""}`).join(",");
  useEffect(() => {
    for (const h of holdings) watchSymbol(h.symbol);
    watchSymbol("SPY");
  }, [key]);
  return liveVsSpy(holdings, quotes, opts?.spyPublish, opts?.storedBenchmark, opts?.fallback);
}

export function fmtVsLabel(vs: number | null | undefined, digits = 2) {
  if (vs == null || Number.isNaN(vs)) return "—";
  const sign = vs > 0 ? "+" : vs < 0 ? "−" : "";
  return `${sign}${Math.abs(vs).toFixed(digits)}%`;
}
