"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";

export function SegmentedTabs({
  options,
  value,
  onChange,
  layoutId = "seg"
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  layoutId?: string;
}) {
  return (
    <div
      className="relative inline-flex items-center gap-0.5 rounded-full border border-teal/10 bg-mist/80 p-1"
      role="tablist"
    >
      {options.map((opt) => {
        const on = opt === value;
        return (
          <button
            key={opt}
            role="tab"
            type="button"
            aria-selected={on}
            className={cn(
              "relative z-10 inline-flex min-h-8 min-w-11 items-center justify-center rounded-full px-4 text-[13px] font-medium transition-colors duration-150",
              on ? "text-ink" : "text-muted hover:text-ink"
            )}
            onClick={() => onChange(opt)}
          >
            {on ? (
              <motion.span
                layoutId={layoutId}
                className="absolute inset-0 z-0 rounded-full bg-glass shadow-[0_8px_30px_-18px_rgba(14,116,144,0.2)]"
                transition={{ type: "tween", duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
              />
            ) : null}
            <span className="relative z-10">{opt}</span>
          </button>
        );
      })}
    </div>
  );
}
