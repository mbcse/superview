"use client";

import { SegmentedTabs } from "@/components/data/segmented-tabs";
import { type World } from "@/lib/world";

export function ComposeChooser({
  lens,
  world,
  system,
  onLens,
  onWorld,
  onSystem
}: {
  lens: "BELIEF" | "SKY";
  world: World;
  chainId?: number;
  system: "VEDIC" | "WESTERN";
  onLens: (v: "BELIEF" | "SKY") => void;
  onWorld: (w: World) => void;
  onChain?: (id: number) => void;
  onSystem: (s: "VEDIC" | "WESTERN") => void;
}) {
  return (
    <div className="mt-8 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <SegmentedTabs
          grow
          layoutId="compose-lens"
          options={["View", "Astrology"]}
          value={lens === "SKY" ? "Astrology" : "View"}
          onChange={(v) => onLens(v === "Astrology" ? "SKY" : "BELIEF")}
        />
        <SegmentedTabs
          grow
          layoutId="compose-desk"
          options={["Stocks", "Memes"]}
          value={world === "MEMES" ? "Memes" : "Stocks"}
          onChange={(v) => onWorld(v === "Memes" ? "MEMES" : "STOCKS")}
        />
      </div>
      {lens === "SKY" ? (
        <SegmentedTabs
          grow
          layoutId="compose-canon"
          options={["Vedic", "Western"]}
          value={system === "VEDIC" ? "Vedic" : "Western"}
          onChange={(v) => onSystem(v === "Vedic" ? "VEDIC" : "WESTERN")}
        />
      ) : null}
    </div>
  );
}
