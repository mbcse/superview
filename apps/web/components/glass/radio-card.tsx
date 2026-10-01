"use client";

import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

export function RadioCard({
  name,
  checked,
  onSelect,
  title,
  description,
  icon,
  disabled
}: {
  name: string;
  checked: boolean;
  onSelect: () => void;
  title: string;
  description: string;
  icon?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors duration-150",
        checked ? "border-teal/40 bg-mist" : "border-teal/15 bg-glass/70 hover:border-teal/35",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <input
        type="radio"
        name={name}
        checked={checked}
        disabled={disabled}
        onChange={onSelect}
        className="sr-only"
      />
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          checked ? "border-teal bg-teal" : "border-teal/30"
        )}
      >
        {checked ? <span className="size-1.5 rounded-full bg-white" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[15px] font-medium text-ink">
          {icon}
          {title}
        </span>
        <span className="mt-1 block text-[13px] text-muted">{description}</span>
      </span>
    </label>
  );
}
