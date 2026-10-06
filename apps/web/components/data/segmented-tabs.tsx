"use client";

import { motion } from "motion/react";
import { cn } from "@/lib/cn";

export function SegmentedTabs({
  options,
  value,
  onChange,
  layoutId = "seg",
  grow,
  size = "md"
}: {
  options: readonly string[];
  value: string;
  onChange: (v: string) => void;
  layoutId?: string;
  grow?: boolean;
  size?: "sm" | "md";
}) {
  return (
    <div
      className={cn(
        "relative inline-flex items-center gap-0.5 rounded-full border border-teal/10 bg-mist/80 p-1",
        grow && "flex w-full"
      )}
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
              "relative z-10 inline-flex items-center justify-center rounded-full font-medium transition-colors duration-150",
              size === "sm" ? "min-h-7 min-w-9 px-3 text-[12px]" : "min-h-8 min-w-11 px-4 text-[13px]",
              grow && "flex-1",
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
