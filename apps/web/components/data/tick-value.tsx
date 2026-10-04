"use client";

import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "motion/react";
import { cn } from "@/lib/cn";

export function useTickFlash(value: number | null | undefined, pulse?: number | null) {
  const reduce = useReducedMotion();
  const [flash, setFlash] = useState<"up" | "down" | null>(null);
  const [gen, setGen] = useState(0);
  const prev = useRef<number | null>(null);
  const prevPulse = useRef<number | null>(null);

  useEffect(() => {
    if (value == null || Number.isNaN(value)) {
      prevPulse.current = pulse ?? null;
      return;
    }
    const moved = prev.current != null && value !== prev.current;
    const pulsed = pulse != null && prevPulse.current != null && pulse !== prevPulse.current;
    if (!moved && !pulsed) {
      prev.current = value;
      prevPulse.current = pulse ?? null;
      return;
    }
    const dir = moved ? (value > (prev.current ?? value) ? "up" : "down") : value >= (prev.current ?? value) ? "up" : "down";
    prev.current = value;
    prevPulse.current = pulse ?? null;
    if (reduce) return;
    setFlash(dir);
    setGen((g) => g + 1);
    const t = window.setTimeout(() => setFlash(null), 420);
    return () => window.clearTimeout(t);
  }, [value, pulse, reduce]);

  return { flash, gen };
}

export function TickValue({
  value,
  format,
  className,
  pulse,
  color = "sign"
}: {
  value: number | null | undefined;
  format: (n: number) => string;
  className?: string;
  pulse?: number | null;
  color?: "sign" | "tick" | "none";
}) {
  const { flash, gen } = useTickFlash(value, pulse);
  const tone =
    color === "none"
      ? null
      : flash && color === "tick"
        ? flash
        : color === "sign" && value != null
          ? value < 0
            ? "down"
            : value > 0
              ? "up"
              : null
          : flash;

  if (value == null || Number.isNaN(value)) return <span className={className}>—</span>;
  return (
    <span
      key={gen}
      aria-live="polite"
      className={cn(
        "tick-value num tabular-nums",
        flash === "up" && "tick-up",
        flash === "down" && "tick-down",
        tone === "up" && "text-up",
        tone === "down" && "text-down",
        className
      )}
    >
      {format(value)}
    </span>
  );
}
