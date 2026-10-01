"use client";

import { motion, useReducedMotion } from "motion/react";
import { tick } from "@/lib/fmt";

const COLORS = ["#0e8f8f", "#38b6f0", "#2ec4b6", "#1680b8", "#587079", "#e5484d"];

export function AllocationBar({
  parts,
  legend = true
}: {
  parts: Array<{ symbol: string; weightBps: number }>;
  legend?: boolean;
}) {
  const reduce = useReducedMotion();
  const total = parts.reduce((s, p) => s + p.weightBps, 0) || 1;
  return (
    <div>
      <div className="flex h-2 overflow-hidden rounded-full bg-secondary">
        {parts.map((p, i) => (
          <motion.span
            key={p.symbol}
            className="h-full"
            style={{ background: COLORS[i % COLORS.length] }}
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${(p.weightBps / total) * 100}%` }}
            transition={{ duration: reduce ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
          />
        ))}
      </div>
      {legend ? (
        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
          {parts.map((p, i) => (
            <li key={p.symbol} className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
              {tick(p.symbol)} {(p.weightBps / 100).toFixed(1)}%
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
