"use client";

import { useEffect, useSyncExternalStore, type ReactNode } from "react";
import { API_ORIGIN } from "@/lib/fmt";
import {
  applyQuotes,
  enqueueQuotes,
  getQuote,
  getQuoteBook,
  onWanted,
  subscribeAll,
  subscribeSymbol,
  wantedSymbols,
  watchSymbol as watchInStore,
  type LiveQuote
} from "@/lib/quote-store";

export type { LiveQuote };

export function watchSymbol(symbol: string) {
  watchInStore(symbol);
}

function startPriceStream() {
  let closed = false;
  let es: EventSource | null = null;
  let retry = 0;

  function apply(list: Array<LiveQuote & { last?: number | null }>) {
    enqueueQuotes(
      list
        .filter((q) => q.last != null && !Number.isNaN(q.last))
        .map((q) => ({ ...q, last: q.last as number }))
    );
  }

  async function pull() {
    const symbols = wantedSymbols();
    if (!symbols.length) return;
    try {
      const r = await fetch(`${API_ORIGIN}/v1/quotes?symbols=${encodeURIComponent(symbols.join(","))}`);
      const d = (await r.json()) as { quotes?: Array<LiveQuote & { last: number | null }> };
      apply(d.quotes ?? []);
    } catch {
      /* ignore */
    }
  }

  function connect() {
    if (closed) return;
    es?.close();
    es = new EventSource(`${API_ORIGIN}/v1/stream/prices`);
    es.onmessage = (ev) => {
      retry = 0;
      try {
        const parsed = JSON.parse(ev.data) as { quotes?: LiveQuote[] };
        if (parsed.quotes?.length) apply(parsed.quotes);
      } catch {
        /* ignore */
      }
    };
    es.onerror = () => {
      es?.close();
      es = null;
      if (closed) return;
      const wait = Math.min(8000, 400 * 2 ** retry);
      retry += 1;
      window.setTimeout(connect, wait);
    };
  }

  let wantedPull = 0;
  void pull();
  connect();
  const poll = window.setInterval(() => void pull(), 500);
  const offWanted = onWanted(() => {
    window.clearTimeout(wantedPull);
    wantedPull = window.setTimeout(() => void pull(), 80);
  });
  return () => {
    closed = true;
    window.clearInterval(poll);
    window.clearTimeout(wantedPull);
    offWanted();
    es?.close();
  };
}

let streamUsers = 0;
let stopStream: (() => void) | null = null;

export function PriceStreamProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    if (streamUsers === 0) stopStream = startPriceStream();
    streamUsers += 1;
    return () => {
      streamUsers -= 1;
      if (streamUsers === 0) {
        stopStream?.();
        stopStream = null;
      }
    };
  }, []);
  return children;
}

export function useQuoteBook() {
  return useSyncExternalStore(subscribeAll, getQuoteBook, getQuoteBook);
}

export function useLiveQuote(symbol?: string) {
  useEffect(() => {
    if (symbol) watchInStore(symbol);
  }, [symbol]);
  return useSyncExternalStore(
    (fn) => (symbol ? subscribeSymbol(symbol, fn) : () => {}),
    () => getQuote(symbol),
    () => null
  );
}

export { applyQuotes };
