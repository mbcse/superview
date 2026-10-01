"use client";

import { motion, useReducedMotion } from "motion/react";

export type StreamItem = { stage: string; message: string; at?: string };

export function ResearchStream({ items }: { items: StreamItem[] }) {
  const reduce = useReducedMotion();
  return (
    <ol className="space-y-2">
      {items.map((item, i) => (
        <motion.li
          key={`${item.stage}-${i}-${item.message}`}
          initial={reduce ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 380, damping: 28 }}
          className="rounded-[14px] bg-secondary px-3 py-2 text-[13px]"
        >
          <span className="text-muted">{item.stage}</span>
          <span className="mx-2 text-line">·</span>
          <span>{item.message}</span>
        </motion.li>
      ))}
    </ol>
  );
}
