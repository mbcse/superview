"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { Surface } from "@/components/ui/surface";
import { HoldingRow } from "@/components/data/holding-row";
import { SegmentedTabs } from "@/components/data/segmented-tabs";
import { useLiveQuote } from "@/components/social/price-stream";
import { RoleChip } from "@/components/social/role-chip";
import { decisionLabel } from "@/lib/agent-copy";
import { API_ORIGIN, fmtVs, changeTone } from "@/lib/fmt";
import { SkyThesis } from "@/components/social/sky-thesis";

const VsChart = dynamic(() => import("@/components/charts/vs-chart").then((m) => m.VsChart), { ssr: false });
const RANGES = ["1D", "1W", "1M", "YTD"] as const;

function LiveHolding({
  h,
  chainId
}: {
  h: { id?: string; tokenId?: string; token?: { symbol?: string; logoUrl?: string | null; chainId?: number }; weightBps: number; rationale?: string; role?: string; score?: { role?: string }; last?: number; chgPct?: number };
  chainId?: number;
}) {
  const q = useLiveQuote(h.token?.symbol, h.tokenId);
  return (
    <HoldingRow
      symbol={h.token?.symbol ?? ""}
      tokenId={h.tokenId}
      weightBps={h.weightBps}
      last={q?.last ?? h.last}
      chgPct={q?.chgPct ?? h.chgPct}
      rationale={h.rationale}
      role={h.role ?? h.score?.role}
      logoUrl={h.token?.logoUrl}
      chainId={h.token?.chainId ?? chainId}
    />
  );
}

export function PublicTake({
  takeId,
  handle,
  sentence,
  chart,
  lens,
  astrologySystem,
  vs,
  agentLine,
  holdings,
  chainId
}: {
  takeId: string;
  handle: string;
  sentence: string;
  chart?: string | null;
  lens?: string;
  astrologySystem?: string | null;
  vs: number | null;
  agentLine: string;
  chainId?: number;
  holdings: Array<{
    id?: string;
    token?: { symbol?: string; logoUrl?: string | null; chainId?: number };
    weightBps: number;
    rationale?: string;
    role?: string;
    score?: { role?: string };
    last?: number;
    chgPct?: number;
  }>;
}) {
  const [range, setRange] = useState<(typeof RANGES)[number]>("1D");
  const [points, setPoints] = useState<Array<{ asOf: string; indexValue: number | null; benchmarkIndex: number | null }>>([]);
  const tone = changeTone(vs);
  const summary = vs == null ? "No mark vs S&P 500 yet." : `${fmtVs(vs)} vs S&P 500.`;

  useEffect(() => {
    let stop = false;
    function load() {
      fetch(`${API_ORIGIN}/v1/takes/${takeId}/series?range=${range}`)
        .then((r) => r.json())
        .then((j) => {
          if (!stop) setPoints(j.points ?? []);
        })
        .catch(() => {});
    }
    load();
    const id = window.setInterval(load, 8_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [takeId, range]);

  return (
    <div className="space-y-6">
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted">A view on SuperView</p>
      <p className="mt-6 text-[13px] text-muted">{handle}</p>
      {lens === "SKY" ? (
        <SkyThesis size="share" chart={chart} prediction={sentence} />
      ) : (
        <h1 className="display mt-3 text-[28px] text-ink md:text-[40px]">{sentence}</h1>
      )}
      {lens === "SKY" ? (
        <p className="mt-3">
          <span className="inline-flex items-center rounded-full bg-mist px-2.5 py-0.5 text-[12px] font-medium text-ink">
            Astrology{astrologySystem === "VEDIC" ? " · Vedic" : astrologySystem === "WESTERN" ? " · Western" : ""}
          </span>
        </p>
      ) : null}
      <p className="figure mt-6 text-[28px]">
        <span className={tone === "up" ? "text-up" : tone === "down" ? "text-down" : "text-muted"}>
          {vs == null ? "—" : fmtVs(vs)}
        </span>
      </p>
      <p className="mt-2 font-mono text-[13px] text-muted">vs S&P 500 · Illustrative</p>
      <Surface className="p-5">
        <SegmentedTabs options={RANGES} value={range} onChange={(v) => setRange(v as (typeof RANGES)[number])} layoutId="public-range" />
        <div className="mt-4">
          <VsChart points={points} liveVs={vs} range={range} summary={summary} />
        </div>
      </Surface>
      <Surface className="p-5">
        <h2 className="text-[15px] font-medium">Agent</h2>
        <p className="mt-2 text-[15px] text-muted">{agentLine || decisionLabel()}</p>
      </Surface>
      <Surface className="p-5">
        <h2 className="display text-[20px] text-ink">Behind the view</h2>
        {holdings.map((h, i) => (
          <LiveHolding key={h.id ?? h.token?.symbol ?? i} h={h} chainId={chainId} />
        ))}
        {holdings.some((h) => h.role) ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {holdings.map((h) =>
              h.role ? (
                <span key={h.token?.symbol} className="inline-flex items-center gap-2 text-[12px] text-muted">
                  {h.token?.symbol} <RoleChip role={h.role} />
                </span>
              ) : null
            )}
          </div>
        ) : null}
      </Surface>
      <div className="flex flex-wrap gap-3">
        <Link className="inline-flex min-h-12 items-center rounded-full bg-lagoon px-5 font-medium text-white shadow-[0_10px_24px_-12px_rgba(14,116,144,0.6)]" href={`/signup?next=/app/takes/${takeId}`}>
          Invest
        </Link>
        <Link className="inline-flex min-h-11 items-center font-medium" href={`/app/takes/${takeId}`}>
          Open in SuperView
        </Link>
      </div>
    </div>
  );
}
