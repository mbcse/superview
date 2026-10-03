"use client";

import { useState } from "react";
import Link from "next/link";
import { Copy, ChatCircle, Export, ArrowRight } from "@phosphor-icons/react";
import { Spark } from "@/components/charts/spark";
import { ThesisHealth } from "@/components/social/thesis-health";
import { useLiveQuote } from "@/components/social/price-stream";
import { useStockSheet } from "@/components/social/stock-sheet";
import { CommentsButton, useViewComments } from "@/components/social/view-chat";
import { fmtAgo, fmtPooled, tick } from "@/lib/fmt";
import { fmtVsLabel, useLiveVsSpy } from "@/lib/live-vs";
import { TickValue } from "@/components/data/tick-value";
import { LivePrice } from "@/components/social/live-price";
import { FollowButton } from "@/components/social/follow-button";

const CHIP = ["mint", "blue", "rose", "amber"] as const;

export type FeedTake = {
  id: string;
  sentence?: string;
  author: string;
  displayName?: string | null;
  avatar?: string | null;
  handle?: string | null;
  createdAt?: string;
  holdings: Array<{ symbol: string; weightBps: number; last?: number | null; publish?: number | null; chgPct?: number | null; logoUrl?: string | null; rationale?: string | null }>;
  vsSpy: number | null;
  spyPublish?: number | null;
  benchmarkIndex?: number | null;
  backers?: number;
  publicInvestedUsd?: number | null;
  comments?: number;
  forks?: number;
  thesisHealth?: number | null;
  agentStatus?: string | null;
  spark?: number[];
  mode?: string;
  authorId?: string;
  following?: boolean;
  mine?: boolean;
};

function initialsOf(name?: string | null) {
  const parts = (name ?? "?").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function tint(i: number): (typeof CHIP)[number] {
  return CHIP[i % CHIP.length] ?? "mint";
}

function handleOf(take: FeedTake) {
  const raw = (take.handle ?? take.author ?? "").trim();
  if (!raw) return "";
  return raw.startsWith("@") ? raw : `@${raw}`;
}

function modeLabel(mode?: string) {
  if (mode === "DRY_RUN") return "Paper";
  if (mode === "LIVE") return "Real";
  return mode ?? null;
}

export function TakeCard({
  take,
  onInvest,
  onCopy,
  onFollowChange
}: {
  take: FeedTake;
  onInvest?: () => void;
  onCopy?: () => void;
  onFollowChange?: (authorId: string, following: boolean) => void;
}) {
  const vs = useLiveVsSpy(take.holdings, {
    spyPublish: take.spyPublish,
    storedBenchmark: take.benchmarkIndex,
    fallback: take.vsSpy
  });
  const { openComments } = useViewComments();
  const [shared, setShared] = useState(false);
  const name = take.displayName ?? take.author;
  const handle = handleOf(take);
  const ago = fmtAgo(take.createdAt);
  const mode = modeLabel(take.mode);
  const pooled = fmtPooled(take.publicInvestedUsd);

  async function share() {
    const url = `${typeof window !== "undefined" ? window.location.origin : ""}/t/${take.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 1600);
    } catch {
      /* keep going */
    }
  }

  return (
    <article className="post px-4 py-4 sm:px-5 sm:py-5">
      <div className="flex items-start gap-3">
        {take.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={take.avatar} alt="" className="size-11 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-mist text-[13px] font-semibold text-teal">
            {initialsOf(name)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[14px] leading-tight">
            <span className="truncate font-semibold tracking-[-0.015em] text-ink">{name}</span>
            {handle ? <span className="truncate text-[13px] text-muted">{handle}</span> : null}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[12px] text-muted">
            {ago ? <span suppressHydrationWarning>{ago}</span> : null}
            {mode ? (
              <>
                <span aria-hidden>·</span>
                <span>{mode}</span>
              </>
            ) : null}
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-teal" />
              Agent watching
            </span>
          </p>
        </div>
        {take.authorId && !take.mine ? (
          <FollowButton
            authorId={take.authorId}
            following={take.following}
            onChange={(next) => onFollowChange?.(take.authorId!, next)}
          />
        ) : null}
      </div>

      <p className="view mt-3.5 text-[17px] font-medium leading-[1.35] tracking-[-0.02em] text-ink">
        {take.sentence ?? "Untitled view"}
      </p>

      <div className="mt-3.5 overflow-hidden rounded-xl border border-teal/10 bg-white/45">
        <div className="flex items-end justify-between gap-3 px-3 py-3">
          <div>
            <p className="text-[11px] font-medium text-muted">vs S&P 500</p>
            <div className="mt-1 flex items-baseline gap-2">
              <TickValue
                value={vs}
                format={(n) => fmtVsLabel(n, 2)}
                color="sign"
                className="figure text-[28px]"
              />
              <ThesisHealth value={take.thesisHealth} />
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-aqua/70" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-aqua" />
              </span>
              Live
            </p>
          </div>
          {take.spark && take.spark.length > 1 ? <Spark values={take.spark} label="vs S&P 500" /> : null}
        </div>
        <div className="flex gap-1.5 overflow-x-auto border-t border-teal/10 px-2 py-2 hide-scroll">
          {take.holdings.map((h, i) => (
            <HoldingChip key={h.symbol} holding={h} tint={tint(i)} takeId={take.id} />
          ))}
        </div>
        <Link
          href={`/app/takes/${take.id}`}
          className="flex min-h-11 items-center justify-between border-t border-teal/10 px-3 text-[13px] font-semibold text-teal hover:bg-white/55"
        >
          View details
          <ArrowRight size={14} />
        </Link>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted">
        <span>{take.backers ?? 0} invested</span>
        {pooled ? (
          <>
            <span aria-hidden>·</span>
            <span>{pooled} pooled</span>
          </>
        ) : null}
        <span aria-hidden>·</span>
        <CommentsButton takeId={take.id} sentence={take.sentence} count={take.comments} className="text-[13px] text-muted hover:text-ink">
          {take.comments ?? 0} comments
        </CommentsButton>
        <span aria-hidden>·</span>
        <span>{take.forks ?? 0} copies</span>
      </div>

      <div className="mt-3 flex border-t border-teal/10 pt-1">
        <button
          type="button"
          onClick={() => openComments({ takeId: take.id, sentence: take.sentence })}
          className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium text-muted hover:bg-white/60 hover:text-ink"
          aria-label="Comment"
        >
          <ChatCircle size={16} />
          <span className="hidden sm:inline">Comment</span>
        </button>
        {onCopy ? (
          <button
            type="button"
            onClick={onCopy}
            className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium text-muted hover:bg-white/60 hover:text-ink"
            aria-label="Copy view"
          >
            <Copy size={16} />
            <span className="hidden sm:inline">Copy view</span>
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => void share()}
          className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-medium text-muted hover:bg-white/60 hover:text-ink"
          aria-label={shared ? "Copied" : "Share"}
        >
          <Export size={16} />
          <span className="hidden sm:inline">{shared ? "Copied" : "Share"}</span>
        </button>
        {onInvest ? (
          <button
            type="button"
            onClick={onInvest}
            className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold text-teal hover:bg-teal hover:text-white"
          >
            Invest
          </button>
        ) : (
          <Link
            href={`/app/takes/${take.id}`}
            className="flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-lg text-[13px] font-semibold text-teal hover:bg-teal hover:text-white"
          >
            Invest
          </Link>
        )}
      </div>
    </article>
  );
}

function HoldingChip({
  holding,
  tint,
  takeId
}: {
  holding: FeedTake["holdings"][number];
  tint: (typeof CHIP)[number];
  takeId: string;
}) {
  const q = useLiveQuote(holding.symbol);
  const { openStock } = useStockSheet();
  const last = q?.last ?? holding.last;
  const mark =
    tint === "mint"
      ? "bg-positive-soft text-up"
      : tint === "rose"
        ? "bg-mist text-teal"
        : tint === "blue"
          ? "bg-accent text-ink"
          : "bg-mist text-ink";
  return (
    <button
      type="button"
      onClick={() =>
        openStock(holding.symbol, {
          takeId,
          rationale: holding.rationale,
          weightBps: holding.weightBps,
          whyInBasket: holding.rationale
        })
      }
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-teal/12 bg-white/70 py-1 pl-1 pr-2 text-left hover:border-teal/35"
    >
      {holding.logoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={holding.logoUrl} alt="" className="size-6 rounded-md object-cover" />
      ) : (
        <span className={`inline-flex size-6 shrink-0 items-center justify-center rounded-md text-[9px] font-bold ${mark}`}>
          {tick(holding.symbol).slice(0, 2)}
        </span>
      )}
      <span className="text-[12px] font-semibold">{tick(holding.symbol)}</span>
      {last != null ? (
        <LivePrice last={last} chgPct={q?.chgPct} pulse={q?.seq} className="px-0 text-[11px]" />
      ) : null}
    </button>
  );
}
