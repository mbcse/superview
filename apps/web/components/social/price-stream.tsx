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
  let lastWanted = "";
  let streamWorld = "";

  function currentWorld() {
    try {
      return localStorage.getItem("superview:world:v1") === "MEMES" ? "MEMES" : "STOCKS";
    } catch {
      return "STOCKS";
    }
  }

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
      const r = await fetch(`${API_ORIGIN}/v1/quotes?ids=${encodeURIComponent(symbols.join(","))}`);
      const d = (await r.json()) as { quotes?: Array<LiveQuote & { last: number | null }> };
      apply(d.quotes ?? []);
    } catch {
      /* ignore */
    }
  }

  function connect() {
    if (closed) return;
    es?.close();
    const wanted = wantedSymbols();
    const world = currentWorld();
    lastWanted = wanted.slice().sort().join(",");
    streamWorld = world;
    es = new EventSource(`${API_ORIGIN}/v1/stream/prices?world=${world}&ids=${encodeURIComponent(wanted.join(","))}`);
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
  const poll = window.setInterval(() => {
    void pull();
    if (currentWorld() !== streamWorld) connect();
  }, 500);
  const offWanted = onWanted(() => {
    window.clearTimeout(wantedPull);
    wantedPull = window.setTimeout(() => {
      void pull();
      const next = wantedSymbols().slice().sort().join(",");
      if (next !== lastWanted || currentWorld() !== streamWorld) connect();
    }, 80);
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

export function useLiveQuote(symbol?: string, tokenId?: string) {
  useEffect(() => {
    if (symbol) watchInStore(symbol);
    if (tokenId) watchInStore(tokenId);
  }, [symbol, tokenId]);
  return useSyncExternalStore(
    (fn) => {
      const offSymbol = symbol ? subscribeSymbol(symbol, fn) : () => {};
      const offId = tokenId ? subscribeSymbol(tokenId, fn) : () => {};
      return () => {
        offSymbol();
        offId();
      };
    },
    () => getQuote(symbol, tokenId),
    () => null
  );
}

export { applyQuotes };
