"use client";

import { useEffect, useState } from "react";
import { useQueryState } from "nuqs";

export type World = "STOCKS" | "MEMES";

const WORLD_KEY = "superview:world:v1";
const CHAIN_KEY = "superview:chain:v1";

function storedWorld(): World | null {
  try {
    const v = localStorage.getItem(WORLD_KEY);
    return v === "MEMES" || v === "STOCKS" ? v : null;
  } catch {
    return null;
  }
}

function storedChain(world: World): number | null {
  try {
    const raw = JSON.parse(localStorage.getItem(CHAIN_KEY) ?? "{}") as Record<string, number>;
    const n = Number(raw[world]);
    if (world === "MEMES") return n === 101 ? n : null;
    return n === 143 ? n : null;
  } catch {
    return null;
  }
}

function saveChain(world: World, chainId: number) {
  try {
    const raw = JSON.parse(localStorage.getItem(CHAIN_KEY) ?? "{}") as Record<string, number>;
    raw[world] = chainId;
    localStorage.setItem(CHAIN_KEY, JSON.stringify(raw));
  } catch {
    /* ignore */
  }
}

function defaultChain(world: World) {
  return world === "MEMES" ? 101 : 143;
}

function asChain(_id: number, world: World) {
  if (world === "MEMES") return 101;
  return 143;
}

export function useWorld() {
  const [world, setWorld] = useQueryState("world", { defaultValue: "STOCKS" });
  useEffect(() => {
    const saved = storedWorld();
    if (saved && saved !== world) void setWorld(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const next = (world ?? "STOCKS").toUpperCase() === "MEMES" ? "MEMES" : "STOCKS";
  const [chainId, setChainIdState] = useState(() => defaultChain(next));

  useEffect(() => {
    setChainIdState(storedChain(next) ?? defaultChain(next));
  }, [next]);

  return {
    world: next as World,
    setWorld: (w: World) => {
      try {
        localStorage.setItem(WORLD_KEY, w);
      } catch {
        /* ignore */
      }
      void setWorld(w);
    },
    chainId,
    setChainId: (id: number) => {
      const n = asChain(id, next);
      saveChain(next, n);
      setChainIdState(n);
    },
    benchmark: next === "MEMES" ? "SOL" : "SPY"
  };
}

export const DESKS: Array<{ id: string; world: World; chainId: number; title: string }> = [
  { id: "stocks", world: "STOCKS", chainId: 143, title: "Stocks" },
  { id: "memes", world: "MEMES", chainId: 101, title: "Memes" }
];

export function chainChip(chainId?: number | null) {
  if (chainId === 101) return "Solana";
  if (chainId === 8453) return "Base";
  if (chainId === 143) return "Monad";
  if (chainId === 4663) return "Robinhood";
  return null;
}

export function worldQuery(world: World, extra = "") {
  return `world=${world}${extra}`;
}

export function tokenImageSrc(url?: string | null, apiOrigin?: string) {
  if (!url) return "";
  if (url.startsWith("/")) return url;
  const base = apiOrigin ?? "";
  return `${base}/v1/media/token?src=${encodeURIComponent(url)}`;
}
