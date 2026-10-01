"use client";

import { fmtPx, fmtPct } from "@/lib/fmt";
import { cn } from "@/lib/cn";
import { TickValue } from "@/components/data/tick-value";

export function LivePrice({
  last,
  chgPct,
  pulse,
  className
}: {
  last?: number | null;
  chgPct?: number | null;
  pulse?: number | null;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-baseline gap-1.5", className)}>
      <TickValue value={last} format={fmtPx} pulse={pulse} color="tick" />
      {chgPct != null ? <TickValue value={chgPct} format={fmtPct} pulse={pulse} color="sign" /> : null}
    </span>
  );
}
