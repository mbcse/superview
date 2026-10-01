"use client";

import { motion, useReducedMotion } from "motion/react";
import { AllocationBar } from "@/components/data/allocation-bar";
import { tick } from "@/lib/fmt";

export function ResearchLens({
  sentence,
  holdings,
  status
}: {
  sentence: string;
  holdings: Array<{ symbol: string; weightBps: number; rationale?: string }>;
  status?: string;
}) {
  const reduce = useReducedMotion();
  const top = holdings.slice(0, 4);
  return (
    <div className="rounded-[28px] bg-[#f5f7f2] p-6 shadow-[0_28px_70px_rgba(0,0,0,0.28)] md:p-7">
      <p className="text-[13px] font-medium text-muted">Your take</p>
      <p className="display mt-2 text-[26px] leading-[1.12] text-ink md:text-[32px]">{sentence}</p>
      <p className="mt-3 text-[13px] text-muted">{top.length ? "The agent picked these." : "Finding companies…"}</p>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {top.map((h, i) => (
          <motion.div
            key={h.symbol}
            className="rounded-[16px] bg-white px-4 py-3"
            initial={false}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduce ? 0 : 0.12 * i, duration: 0.35 }}
          >
            <p className="text-[13px] text-muted">{tick(h.symbol)}</p>
            <p className="num mt-1 text-[22px] font-semibold text-ink">{(h.weightBps / 100).toFixed(0)}%</p>
            {h.rationale ? <p className="mt-1 line-clamp-2 text-[12px] text-muted">{h.rationale}</p> : null}
          </motion.div>
        ))}
      </div>
      {top.length ? (
        <div className="mt-5">
          <AllocationBar parts={top} legend={false} />
        </div>
      ) : null}
      <p className="mt-5 rounded-[16px] bg-white px-4 py-3 text-[14px] text-ink">{status ?? "Checked today. No change."}</p>
    </div>
  );
}
