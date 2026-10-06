import { useEffect } from "react";
import { useQuoteBook, watchSymbol } from "@/components/social/price-stream";
import { liveBook, liveVsSpy, type VsHolding } from "./live-book";

export type { VsHolding } from "./live-book";
export { fmtVsLabel, holdingReturn, holdingSince, liveBook, liveVsSpy } from "./live-book";

export function useLiveVsSpy(
  holdings: VsHolding[],
  opts?: { spyPublish?: number | null; storedBenchmark?: number | null; fallback?: number | null }
) {
  return useLiveBook(holdings, opts).vs;
}

export function useLiveBook(
  holdings: VsHolding[],
  opts?: { spyPublish?: number | null; storedBenchmark?: number | null; fallback?: number | null; investedUsd?: number | null }
) {
  const quotes = useQuoteBook();
  const key = holdings.map((h) => `${h.tokenId ?? ""}:${h.symbol}:${h.weightBps}:${h.publish ?? ""}`).join(",");
  useEffect(() => {
    for (const h of holdings) {
      watchSymbol(h.symbol);
      if (h.tokenId) watchSymbol(h.tokenId);
    }
    watchSymbol("SPY");
  }, [key]);
  const book = liveBook(holdings, quotes, opts?.investedUsd);
  const vs =
    book.vsSpy ??
    liveVsSpy(holdings, quotes, opts?.spyPublish, opts?.storedBenchmark, opts?.fallback);
  return { ...book, vs };
}
