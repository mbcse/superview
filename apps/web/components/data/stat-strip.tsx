"use client";

import { DeltaPill } from "./delta-pill";
import { AnimatedNumber } from "./animated-number";

export function StatStrip({
  items
}: {
  items: Array<{ label: string; value: number | null; delta?: number | null; color: string }>;
}) {
  return (
    <ul className="flex flex-wrap gap-6">
      {items.map((item) => (
        <li key={item.label} className="min-w-[7rem]">
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <span className="h-2 w-2 rounded-full" style={{ background: item.color }} />
            {item.label}
          </p>
          <p className="num mt-1 text-[22px] font-semibold">
            {item.value == null ? "—" : <AnimatedNumber value={item.value} format={(n) => n.toFixed(2)} />}
          </p>
          {item.delta !== undefined ? (
            <div className="mt-1">
              <DeltaPill value={item.delta} />
            </div>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
