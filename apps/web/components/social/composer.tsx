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
    <div className="post mt-4 overflow-hidden hover:border-teal/30">
      <Link
        href={href}
        className="flex items-center gap-3 px-4 py-3 hover:bg-white/45"
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
      <Link
        href="/app/compose?lens=sky"
        className="flex min-h-11 items-center justify-between border-t border-teal/10 px-4 text-[13px] text-muted hover:bg-white/45 hover:text-ink"
      >
        Chart the sky
        <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-teal">Vedic · Western</span>
      </Link>
    </div>
  );
}

const SKY_MAX = 4000;

export function SkyComposer({
  chart,
  headline,
  onChart,
  onHeadline,
  onSubmit,
  busy
}: {
  chart: string;
  headline: string;
  onChart: (v: string) => void;
  onHeadline: (v: string) => void;
  onSubmit: () => void;
  busy?: boolean;
}) {
  function submit(e: FormEvent) {
    e.preventDefault();
    onSubmit();
  }
  const ready = chart.trim().length >= 8;
  return (
    <form onSubmit={submit} className="post p-5 md:p-6">
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-teal">Sky</p>
      <label className="sr-only" htmlFor="sky-chart">
        Planetary movements
      </label>
      <textarea
        id="sky-chart"
        aria-label="Planetary movements"
        autoFocus
        rows={7}
        className="view mt-2 w-full resize-none bg-transparent text-[17px] font-medium leading-[1.45] tracking-[-0.02em] text-ink outline-none placeholder:text-muted/60"
        value={chart}
        onChange={(e) => onChart(e.target.value.slice(0, SKY_MAX))}
        placeholder="Mars enters Scorpio. Saturn aspects the 10th."
        maxLength={SKY_MAX}
        disabled={busy}
      />
      <p className="mt-5 text-[11px] font-medium uppercase tracking-[0.08em] text-teal">
        Prediction <span className="font-normal normal-case tracking-normal text-muted">optional</span>
      </p>
      <label className="sr-only" htmlFor="sky-headline">
        Public headline
      </label>
      <input
        id="sky-headline"
        aria-label="Public headline"
        className="mt-1.5 w-full bg-transparent text-[15px] text-ink outline-none placeholder:text-muted/60"
        value={headline}
        onChange={(e) => onHeadline(e.target.value.slice(0, MAX))}
        placeholder="If empty, the agent writes the view from the sky."
        maxLength={MAX}
        disabled={busy}
      />
      <div className="mt-4 flex items-center justify-between gap-4 border-t border-teal/10 pt-5">
        <CounterRing count={chart.length} max={SKY_MAX} warnAt={3600} />
        <Button type="submit" variant="primary" size="lg" disabled={busy || !ready}>
          {busy ? "Researching…" : "Read this sky"} <ArrowRight size={16} />
        </Button>
      </div>
    </form>
  );
}
