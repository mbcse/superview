"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { Button } from "@/components/ui/button";
import { Chip, Notice, Surface } from "@/components/ui/surface";
import { API_ORIGIN, fmtPooled, fmtPct, fmtUsd, fmtUsdDelta, fmtVs, tick } from "@/lib/fmt";
import { fmtVsLabel, useLiveBook } from "@/lib/live-vs";
import { ApiError } from "@/lib/api";
import { decisionLabel } from "@/lib/agent-copy";
import { HoldingRow } from "@/components/data/holding-row";
import { SegmentedTabs } from "@/components/data/segmented-tabs";
import { ThesisHealth } from "@/components/social/thesis-health";
import { useLiveQuote } from "@/components/social/price-stream";
import { InvestDialog } from "@/components/social/invest-dialog";
import { ViewCommentsList } from "@/components/social/view-chat";
import { AgentOrb } from "@/components/glass/agent-orb";
import { TickValue } from "@/components/data/tick-value";
import { FollowButton } from "@/components/social/follow-button";
import { SkyThesis } from "@/components/social/sky-thesis";

const VsChart = dynamic(() => import("@/components/charts/vs-chart").then((m) => m.VsChart), { ssr: false });
const RANGES = ["1D", "1W", "1M", "YTD"] as const;

type AgentPayload = {
  brief: { summary: string; whatChanged?: unknown; thesisHealth?: number } | null;
  decisions: Array<{ id: string; status: string; reasoning: string; createdAt: string; proposal?: unknown }>;
};

function initialsOf(name?: string | null) {
  const parts = (name ?? "?").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "?") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function SaveToCollection({
  takeId,
  fetchApi
}: {
  takeId: string;
  fetchApi: ReturnType<typeof useAuthedFetch>;
}) {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Array<{ id: string; title: string }>>([]);
  const [saved, setSaved] = useState("");
  async function load() {
    const d = await fetchApi<{ collections: Array<{ id: string; title: string }> }>("/v1/collections");
    setRows(d.collections ?? []);
    setOpen(true);
  }
  async function save(id?: string) {
    let collectionId = id;
    if (!collectionId) {
      const created = await fetchApi<{ collection: { id: string; title: string } }>("/v1/collections", {
        method: "POST",
        body: JSON.stringify({ title: "Saved views" })
      });
      collectionId = created.collection.id;
    }
    await fetchApi(`/v1/collections/${collectionId}/items`, {
      method: "POST",
      body: JSON.stringify({ takeId })
    });
    setSaved("Saved");
    setOpen(false);
  }
  return (
    <div className="relative">
      <Button variant="ghost" onClick={() => void (open ? setOpen(false) : load())}>
        {saved || "Save"}
      </Button>
      {open ? (
        <div className="absolute z-20 mt-2 w-56 rounded-[16px] border border-teal/15 bg-canvas p-2 shadow-lg">
          {rows.map((c) => (
            <button key={c.id} type="button" className="block w-full rounded-lg px-3 py-2 text-left text-[13px] hover:bg-mist" onClick={() => void save(c.id)}>
              {c.title}
            </button>
          ))}
          <button type="button" className="mt-1 block w-full rounded-lg px-3 py-2 text-left text-[13px] text-teal" onClick={() => void save()}>
            New collection
          </button>
        </div>
      ) : null}
    </div>
  );
}

function bare(symbol?: string | null, source?: string | null) {
  return tick(String(symbol ?? ""), source ?? undefined);
}

function LiveHolding({
  h,
  takeId,
  pnlUsd,
  chainId
}: {
  h: any;
  takeId: string;
  pnlUsd?: number | null;
  chainId?: number;
}) {
  const q = useLiveQuote(h.token?.symbol, h.tokenId);
  const score = h.score ?? {};
  return (
    <HoldingRow
      symbol={h.token?.symbol ?? ""}
      tokenId={h.tokenId}
      weightBps={h.weightBps}
      last={q?.last ?? h.last}
      chgPct={q?.chgPct ?? h.chgPct}
      pnlUsd={pnlUsd}
      rationale={h.rationale}
      role={h.role ?? score.role}
      logoUrl={h.token?.logoUrl}
      takeId={takeId}
      whyInBasket={score.whyInBasket ?? h.rationale}
      venue={h.token?.venue}
      liquidityUsd={h.token?.liquidityUsd != null ? Number(h.token.liquidityUsd) : null}
      launchedAt={h.token?.launchedAt}
      noExit={Boolean((h.token?.riskFlags as { noExit?: boolean } | null)?.noExit)}
      chainId={h.token?.chainId ?? chainId}
    />
  );
}

function StakeMark({
  investedUsd,
  valueUsd,
  pnlUsd,
  displayPct,
  sinceInvested,
  seq
}: {
  investedUsd: number;
  valueUsd: number | null;
  pnlUsd: number | null;
  displayPct: number | null;
  sinceInvested: boolean;
  seq: number;
}) {
  return (
    <div>
      <TickValue
        value={valueUsd ?? investedUsd}
        format={fmtUsd}
        pulse={seq}
        color="none"
        className="figure text-[28px] text-ink"
      />
      <p className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <TickValue value={pnlUsd} format={fmtUsdDelta} pulse={seq} color="sign" className="font-mono text-[13px]" />
        <TickValue value={displayPct} format={fmtPct} pulse={seq} color="sign" className="font-mono text-[13px]" />
      </p>
      <p className="mt-2 flex items-center gap-1.5 font-mono text-[13px] text-muted">
        <span className="relative flex h-1.5 w-1.5">
          <span className="absolute inset-0 animate-ping rounded-full bg-aqua/70" />
          <span className="relative h-1.5 w-1.5 rounded-full bg-aqua" />
        </span>
        {sinceInvested ? `your ${fmtUsd(investedUsd)} · since invested` : `your ${fmtUsd(investedUsd)} · today`}
      </p>
    </div>
  );
}

export default function TakeClient({ data }: { data: any }) {
  const take = data.take;
  const rev = take.revisions?.[0];
  const fetchApi = useAuthedFetch();
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [range, setRange] = useState<(typeof RANGES)[number]>("1D");
  const [points, setPoints] = useState<any[]>([]);
  const [agent, setAgent] = useState<AgentPayload | null>(null);
  const [investOpen, setInvestOpen] = useState(false);
  const [following, setFollowing] = useState(Boolean(data.following));
  const [publicUsd, setPublicUsd] = useState<number | null>(data.publicInvestedUsd ?? null);
  const [myUsd, setMyUsd] = useState<number | null>(data.myInvestedUsd ?? null);
  const [myReveal, setMyReveal] = useState<boolean | null>(data.myRevealAmount ?? null);
  const holdings = rev?.target?.holdings ?? [];
  const val = take.valuations?.[take.valuations.length - 1];
  const contrib = (val?.holdingContributions ?? []) as Array<{ tokenId?: string; symbol?: string; publish?: number | null; last?: number | null }>;
  const spyPublish = contrib.find((c) => {
    const s = String(c.symbol ?? "").toUpperCase();
    return s === "RHSPY" || s === "SPY";
  })?.publish ?? null;
  const storedVs = val ? Number(val.indexValue) - Number(val.benchmarkIndex) : null;
  const vsHoldings = holdings.map((h: any) => ({
    tokenId: String(h.tokenId ?? ""),
    symbol: String(h.token?.symbol ?? ""),
    weightBps: Number(h.weightBps ?? 0),
    last: contrib.find((c) => c.tokenId === h.tokenId)?.last ?? null,
    publish: contrib.find((c) => c.tokenId === h.tokenId)?.publish ?? null
  }));
  const book = useLiveBook(vsHoldings, {
    spyPublish,
    storedBenchmark: val ? Number(val.benchmarkIndex) : null,
    fallback: storedVs,
    investedUsd: myUsd
  });
  const vs = book.vs;
  const bench = take.world === "MEMES" ? "SOL" : "S&P 500";
  const summary = vs == null ? `No mark vs ${bench} yet.` : `${fmtVs(vs)} vs ${bench}.`;
  const legPnl = new Map(book.legs.map((l) => [bare(l.symbol), l.pnlUsd]));
  const research = rev?.researchRun;
  const authorName = take.author?.displayName ?? take.author?.handle ?? "Member";
  const candidates = research?.candidates ?? [];
  const scoreBySymbol = new Map(
    candidates.map((c: any) => [tick(String(c.token?.symbol ?? ""), c.token?.source), c.score])
  );
  const basket = holdings.map((h: any) => ({
    ...h,
    score: h.score ?? scoreBySymbol.get(tick(String(h.token?.symbol ?? ""), h.token?.source))
  }));

  useEffect(() => {
    let stop = false;
    async function load() {
      try {
        const r = await fetch(`${API_ORIGIN}/v1/takes/${take.id}/series?range=${range}`);
        const j = await r.json();
        if (!stop) setPoints(j.points ?? []);
      } catch {
        if (!stop) setPoints([]);
      }
    }
    void load();
    const id = window.setInterval(() => void load(), 8_000);
    return () => {
      stop = true;
      window.clearInterval(id);
    };
  }, [take.id, range]);

  useEffect(() => {
    fetchApi<any>(`/v1/takes/${take.id}`)
      .then((d) => {
        setPublicUsd(d.publicInvestedUsd ?? null);
        setMyUsd(d.myInvestedUsd ?? null);
        setMyReveal(d.myRevealAmount ?? null);
        setFollowing(Boolean(d.following));
      })
      .catch(() => {});
    fetchApi<AgentPayload>(`/v1/takes/${take.id}/agent`)
      .then(setAgent)
      .catch(() => {});
  }, [fetchApi, take.id]);

  async function back(level: string) {
    try {
      await fetchApi(`/v1/takes/${take.id}/back`, {
        method: "POST",
        body: JSON.stringify({ level, mandateMode: "AUTO" })
      });
      setMsg(level === "WATCH" ? "Watching this view." : "Paper money is on this view.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setMsg("Sign in to invest.");
      else setMsg("Couldn’t put paper money on this view.");
    }
  }

  async function copyView() {
    try {
      const r = await fetchApi<{ forkTakeId: string }>(`/v1/takes/${take.id}/fork`, { method: "POST" });
      router.push(`/app/compose?fork=${r.forkTakeId}`);
    } catch {
      setMsg("Couldn’t copy this view.");
    }
  }

  async function toggleReveal() {
    if (myReveal == null) return;
    const next = !myReveal;
    try {
      const r = await fetchApi<{ publicInvestedUsd: number | null; myRevealAmount: boolean }>(`/v1/takes/${take.id}/backing/privacy`, {
        method: "PATCH",
        body: JSON.stringify({ revealAmount: next })
      });
      setMyReveal(r.myRevealAmount);
      setPublicUsd(r.publicInvestedUsd);
    } catch {
      setMsg("Couldn’t update privacy.");
    }
  }

  const memo = (take.comments ?? []).find(
    (c: any) =>
      c.isPinned &&
      c.authorType === "AGENT" &&
      !/invalid token|"code"\s*:\s*16|Write an investment memo|You are the agent that runs this view|\{\{view\}\}/i.test(String(c.body ?? ""))
  );
  const backers = data.backers ?? take.backings?.filter((b: any) => b.level === "DRY_RUN" || b.level === "LIVE").length ?? 0;

  return (
    <div className="space-y-5 pb-10">
      <section>
        <div className="flex items-center gap-3">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-teal/15 bg-mist text-xs font-semibold">
            {initialsOf(authorName)}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-medium text-ink">{authorName}</p>
            <p className="text-[13px] text-muted">{take.author?.handle}</p>
          </div>
          {take.authorId && !data.mine ? (
            <FollowButton authorId={take.authorId} following={following} onChange={setFollowing} />
          ) : null}
        </div>
        {take.lens === "SKY" ? (
          <SkyThesis size="page" chart={rev?.astrologyChart} prediction={rev?.sentence} />
        ) : (
          <h1 className="view mt-5 text-[22px] font-medium leading-[1.3] tracking-[-0.02em] text-ink md:text-[28px]">{rev?.sentence}</h1>
        )}
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
          <AgentOrb size={14} /> Agent watching
          {take.lens === "SKY" ? (
            <Chip>
              Astrology{take.astrologySystem === "VEDIC" ? " · Vedic" : take.astrologySystem === "WESTERN" ? " · Western" : ""}
            </Chip>
          ) : null}
        </p>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-6 border-y border-teal/10 py-6">
          {myUsd != null ? (
            <StakeMark
              investedUsd={myUsd}
              valueUsd={book.valueUsd}
              pnlUsd={book.pnlUsd}
              displayPct={book.displayPct}
              sinceInvested={book.sinceInvested}
              seq={book.seq}
            />
          ) : null}
          <div>
            <TickValue
              value={vs}
              format={(n) => fmtVsLabel(n, 2)}
              pulse={vs != null && Math.abs(vs) >= 0.005 ? book.seq : undefined}
              color="sign"
              className="figure text-[28px]"
            />
            <p className="mt-2 flex items-center gap-1.5 font-mono text-[13px] text-muted">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inset-0 animate-ping rounded-full bg-aqua/70" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-aqua" />
              </span>
              {take.seeded ? `vs ${bench} · live quotes, seeded history is illustrative` : `vs ${bench} · live`}
            </p>
          </div>
          <div className="text-right">
            {publicUsd != null ? (
              <>
                <p className="figure text-[28px] text-ink">{fmtPooled(publicUsd)}</p>
                <p className="mt-2 font-mono text-[13px] text-muted">{backers} invested</p>
              </>
            ) : (
              <>
                <p className="figure text-[22px] text-ink">{backers} invested</p>
                {myUsd != null && !myReveal ? (
                  <p className="mt-2 text-[13px] text-muted">You invested {fmtUsd(myUsd)} privately</p>
                ) : null}
              </>
            )}
          </div>
          <ThesisHealth value={agent?.brief?.thesisHealth} />
        </div>
        {myReveal != null ? (
          <label className="mt-4 flex items-center gap-2 text-[13px] text-ink">
            <input type="checkbox" checked={Boolean(myReveal)} onChange={() => void toggleReveal()} className="size-4 accent-teal" />
            Show my amount on this view
          </label>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2">
          <Button variant="primary" onClick={() => setInvestOpen(true)}>
            Invest
          </Button>
          <Button variant="ghost" onClick={() => void copyView()}>
            Copy view
          </Button>
          <Button variant="ghost" onClick={() => void back("WATCH")}>
            Watch
          </Button>
          <SaveToCollection takeId={take.id} fetchApi={fetchApi} />
        </div>
      </section>
      {investOpen ? (
        <InvestDialog
          takeId={take.id}
          sentence={rev?.sentence}
          chainId={take.chainId}
          world={take.world}
          onClose={() => setInvestOpen(false)}
        />
      ) : null}
      {msg ? <Notice>{msg}</Notice> : null}
      <Surface className="p-5">
        <SegmentedTabs options={RANGES} value={range} onChange={(v) => setRange(v as (typeof RANGES)[number])} layoutId="take-range" />
        <div className="mt-4">
          <VsChart points={points} liveVs={vs} range={range} summary={summary} />
        </div>
      </Surface>
      <Surface className="p-5">
        <h2 className="display text-[20px] text-ink">Basket</h2>
        <div className="mt-2">
          {basket.map((h: any) => (
            <LiveHolding
              key={h.id ?? h.tokenId}
              h={h}
              takeId={take.id}
              pnlUsd={myUsd != null ? (legPnl.get(bare(h.token?.symbol)) ?? null) : null}
              chainId={take.chainId}
            />
          ))}
        </div>
      </Surface>
      <Surface className="p-5">
        <h2 className="display text-[20px] text-ink">Agent</h2>
        <p className="mt-2 text-[15px] text-muted">{agent?.brief?.summary ?? decisionLabel(agent?.decisions?.[0]?.status)}</p>
        {research?.thesis ? (
          <div className="mt-4 space-y-2 text-[14px]">
            <p>{research.thesis.interpretation}</p>
            {Array.isArray(research.actions) ? (
              <p className="text-muted">Angles: {research.actions.map((a: any) => a.name).join(" · ")}</p>
            ) : null}
          </div>
        ) : null}
        <ul className="mt-4 space-y-2 text-[14px] text-muted">
          {(agent?.decisions ?? []).slice(0, 8).map((d) => (
            <li key={d.id}>
              <span className="text-ink">{decisionLabel(d.status)}</span>
              {d.reasoning ? ` · ${d.reasoning}` : ""}
            </li>
          ))}
        </ul>
      </Surface>
      {memo ? (
        <details className="panel p-5">
          <summary className="cursor-pointer text-[15px] font-medium">Memo</summary>
          <p className="mt-3 whitespace-pre-wrap text-[14px] text-muted">{memo.body}</p>
        </details>
      ) : null}
      <Surface className="p-5">
        <h2 id="comments" className="display text-[20px] text-ink">
          Comments
        </h2>
        <ViewCommentsList takeId={take.id} className="mt-2" />
        <div className="mt-4 flex gap-2 text-[13px] text-muted">
          <Chip>Bull {(take.stances ?? []).filter((s: any) => s.stance === "BULL").length}</Chip>
          <Chip tone="down">Bear {(take.stances ?? []).filter((s: any) => s.stance === "BEAR").length}</Chip>
        </div>
      </Surface>
      <p className="text-[12px] text-muted">
        <Link href={`/t/${take.id}`}>Public link</Link>
      </p>
    </div>
  );
}
