"use client";

import { useEffect } from "react";
import { useQueryState } from "nuqs";

export type World = "STOCKS" | "MEMES";

const KEY = "superview:world:v1";

function storedWorld(): World | null {
  try {
    const v = localStorage.getItem(KEY);
    return v === "MEMES" || v === "STOCKS" ? v : null;
  } catch {
    return null;
  }
}

export function useWorld() {
  const [world, setWorld] = useQueryState("world", { defaultValue: "STOCKS" });
  useEffect(() => {
    const saved = storedWorld();
    if (saved && saved !== world) void setWorld(saved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const next = (world ?? "STOCKS").toUpperCase() === "MEMES" ? "MEMES" : "STOCKS";
  return {
    world: next as World,
    setWorld: (w: World) => {
      try {
        localStorage.setItem(KEY, w);
      } catch {
        /* ignore */
      }
      void setWorld(w);
    },
    chainId: next === "MEMES" ? 101 : 4663,
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
