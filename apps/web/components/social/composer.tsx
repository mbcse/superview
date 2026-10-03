"use client";

import type { FormEvent } from "react";
import Link from "next/link";
import { ArrowRight, PencilSimple } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { CounterRing } from "@/components/glass/counter-ring";

const MAX = 220;

export function Composer({
  value,
  onChange,
  onSubmit,
  busy,
  autoFocus,
  placeholder = "I believe that…"
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  busy?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }

  return (
    <form onSubmit={submit} className="post p-5 md:p-6">
      <label className="sr-only" htmlFor="view">
        Your view
      </label>
      <textarea
        id="view"
        aria-label="Write your view"
        autoFocus={autoFocus}
        rows={4}
        className="view w-full resize-none bg-transparent text-[20px] font-medium leading-[1.4] tracking-[-0.02em] text-ink outline-none placeholder:text-muted/60"
        value={value}
        onChange={(e) => onChange(e.target.value.slice(0, MAX))}
        placeholder={placeholder}
        maxLength={MAX}
        disabled={busy}
      />
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-teal/10 pt-5">
        <CounterRing count={value.length} max={MAX} warnAt={200} />
        <Button type="submit" variant="primary" size="lg" disabled={busy || value.trim().length < 3}>
          {busy ? "Researching…" : "Put this view"} <ArrowRight size={16} />
        </Button>
      </div>
    </form>
  );
}

export function ComposerEntry({ initials = "You", href = "/app/compose" }: { initials?: string; href?: string }) {
  return (
    <Link
      href={href}
      className="post mt-4 flex items-center gap-3 px-4 py-3 hover:border-teal/30"
      aria-label="Write a new view"
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-mist text-[13px] font-semibold text-teal">
        {initials.slice(0, 2).toUpperCase()}
      </span>
      <p className="flex min-h-10 min-w-0 flex-1 items-center truncate rounded-full border border-teal/15 bg-white/55 px-4 text-[15px] text-muted">
        Share a view on the world…
      </p>
      <Button size="sm" variant="primary" tabIndex={-1} aria-hidden="true">
        <PencilSimple size={14} />
        New view
      </Button>
    </Link>
  );
}
