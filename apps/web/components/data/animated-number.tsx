"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

export function AnimatedNumber({
  value,
  format,
  className
}: {
  value: number | null | undefined;
  format: (n: number) => string;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(value ?? 0);

  useEffect(() => {
    if (value == null || Number.isNaN(value)) return;
    if (reduce) {
      setShown(value);
      return;
    }
    const from = shown;
    const to = value;
    const start = performance.now();
    const dur = 700;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce]);

  if (value == null || Number.isNaN(value)) return <span className={className}>—</span>;
  return <span className={className}>{format(shown)}</span>;
}
