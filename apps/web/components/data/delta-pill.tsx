"use client";

import { changeTone, fmtPct } from "@/lib/fmt";
import { cn } from "@/lib/cn";

export function DeltaPill({ value, className, points }: { value: number | null | undefined; className?: string; points?: boolean }) {
  const tone = changeTone(value);
  const label = points
    ? value == null || Number.isNaN(value)
      ? "—"
      : `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(2)}%`
    : fmtPct(value);
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium num",
        tone === "up" && "bg-positive-soft text-up",
        tone === "down" && "bg-[#f4e1e8] text-down",
        tone === "flat" && "bg-secondary text-muted",
        className
      )}
    >
      <span aria-hidden="true">{tone === "up" ? "↑" : tone === "down" ? "↓" : "·"}</span>
      {label}
    </span>
  );
}
