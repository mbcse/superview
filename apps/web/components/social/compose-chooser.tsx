"use client";

import { SegmentedTabs } from "@/components/data/segmented-tabs";
import { DESKS, type World } from "@/lib/world";

const CHAIN_LABEL: Record<number, string> = {
  4663: "Robinhood Chain",
  101: "Solana"
};

export function ComposeChooser({
  lens,
  world,
  chainId,
  system,
  onLens,
  onWorld,
  onChain,
  onSystem
}: {
  lens: "BELIEF" | "SKY";
  world: World;
  chainId: number;
  system: "VEDIC" | "WESTERN";
  onLens: (v: "BELIEF" | "SKY") => void;
  onWorld: (w: World) => void;
  onChain: (id: number) => void;
  onSystem: (s: "VEDIC" | "WESTERN") => void;
}) {
  const chains = DESKS.filter((d) => d.world === world);
  const chainOptions = chains.map((d) => CHAIN_LABEL[d.chainId] ?? d.title);
  const chainValue = CHAIN_LABEL[chainId] ?? chainOptions[0] ?? "Solana";

  return (
    <div className="mt-8 space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <SegmentedTabs
          grow
          layoutId="compose-lens"
          options={["View", "Sky"]}
          value={lens === "SKY" ? "Sky" : "View"}
          onChange={(v) => onLens(v === "Sky" ? "SKY" : "BELIEF")}
        />
        <SegmentedTabs
          grow
          layoutId="compose-desk"
          options={["Stocks", "Memes"]}
          value={world === "MEMES" ? "Memes" : "Stocks"}
          onChange={(v) => onWorld(v === "Memes" ? "MEMES" : "STOCKS")}
        />
      </div>
      {chainOptions.length > 1 ? (
        <SegmentedTabs
          grow
          layoutId="compose-chain"
          options={chainOptions}
          value={chainValue}
          onChange={(v) => {
            const next = chains.find((d) => (CHAIN_LABEL[d.chainId] ?? d.title) === v);
            if (next) onChain(next.chainId);
          }}
        />
      ) : null}
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
