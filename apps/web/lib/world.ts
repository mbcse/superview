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
    return n === 101 || n === 4663 ? n : null;
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
  return world === "MEMES" ? 101 : 4663;
}

function asChain(id: number, world: World) {
  return id === 101 || id === 4663 ? id : defaultChain(world);
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
  { id: "stocks-rh", world: "STOCKS", chainId: 4663, title: "Robinhood Chain" },
  { id: "stocks-sol", world: "STOCKS", chainId: 101, title: "Solana" },
  { id: "memes-sol", world: "MEMES", chainId: 101, title: "Solana" },
  { id: "memes-rh", world: "MEMES", chainId: 4663, title: "Robinhood Chain" }
];

export function worldQuery(world: World, extra = "") {
  return `world=${world}${extra}`;
}

export function tokenImageSrc(url?: string | null, apiOrigin?: string) {
  if (!url) return "";
  if (url.startsWith("/")) return url;
  const base = apiOrigin ?? "";
  return `${base}/v1/media/token?src=${encodeURIComponent(url)}`;
}
