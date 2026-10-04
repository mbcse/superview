"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useQueryState } from "nuqs";
import dynamic from "next/dynamic";
import { API_ORIGIN } from "@/lib/fmt";
import { proposalLine } from "@/lib/agent-copy";
import { EmptyState } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { DeltaPill } from "@/components/data/delta-pill";
import { StatStrip } from "@/components/data/stat-strip";
import { MoverCard } from "@/components/data/mover-card";
import { HoldingRow } from "@/components/data/holding-row";
import { SegmentedTabs } from "@/components/data/segmented-tabs";
import { TickValue } from "@/components/data/tick-value";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { useAuth } from "@/components/auth-provider";
import { fmtVsLabel, useLiveVsSpy } from "@/lib/live-vs";

const VsChart = dynamic(() => import("@/components/charts/vs-chart").then((m) => m.VsChart), { ssr: false });

const RANGES = ["1D", "1W", "1M", "YTD"] as const;

type Holding = { symbol: string; weightBps: number; last: number | null; chgPct: number | null; feed?: boolean; rationale?: string };
type TakeRow = {
  id: string;
  sentence?: string;
  author: string;
  holdings: Holding[];
  vsSpy: number | null;
  asOf: string | null;
  watchers: number;
  dryRun: number;
  live: number;
  backers?: number;
  seeded?: boolean;
};
type Proposal = { id: string; takeId: string; sentence: string | null; trades: unknown };

export default function DashboardClient({ initial }: { initial: TakeRow[] }) {
  const { ready } = useAuth();
  const fetchApi = useAuthedFetch();
  const [q] = useQueryState("q", { defaultValue: "" });
  const [takes, setTakes] = useState(initial);
  const [selected, setSelected] = useState(initial[0]?.id ?? "");
  const [range, setRange] = useState<(typeof RANGES)[number]>("1D");
  const [points, setPoints] = useState<Array<{ asOf: string; indexValue: number | null; benchmarkIndex: number | null }>>([]);
  const [stale, setStale] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [agentByTake, setAgentByTake] = useState<Record<string, string>>({});

  const visible = useMemo(() => {
    const query = q.toLowerCase();
    return takes.filter((t) => {
      if (!query) return true;
      return `${t.sentence ?? ""} ${t.author} ${t.holdings.map((h) => h.symbol).join(" ")}`.toLowerCase().includes(query);
    });
  }, [takes, q]);
  const featured = visisibleSafe(visible, selected);

  useEffect(() => {
    if (!featured) return;
    let stop = false;
    function load() {
      fetch(`${API_ORIGIN}/v1/takes/${featured!.id}/series?range=${range}`)
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
  }, [featured?.id, range]);

  useEffect(() => {
    const es = new EventSource(`${API_ORIGIN}/v1/live/board`);
    es.onmessage = (ev) => {
      try {
        const board = JSON.parse(ev.data) as { books?: TakeRow[] };
        setTakes(board.books ?? []);
        setStale(false);
      } catch {}
    };
    es.onerror = () => setStale(true);
    return () => es.close();
  }, []);

  useEffect(() => {
    if (!ready) return;
    fetchApi<{ proposals: Proposal[] }>("/v1/me/proposals")
      .then((d) => setProposals(d.proposals ?? []))
      .catch(() => setProposals([]));
  }, [fetchApi, ready]);

  useEffect(() => {
    if (!featured?.id) return;
    fetch(`${API_ORIGIN}/v1/takes/${featured.id}/agent`)
      .then((r) => r.json())
      .then((j) => {
        const line = j.brief?.summary ?? (j.proposals?.length ? "Proposal waiting." : "Checked today. No change.");
        setAgentByTake((m) => ({ ...m, [featured.id]: line }));
      })
      .catch(() => {});
  }, [featured?.id]);

  async function act(id: string, kind: "approve" | "skip") {
    try {
      await fetchApi(`/v1/proposals/${id}/${kind}`, { method: "POST" });
      setProposals((p) => p.filter((x) => x.id !== id));
    } catch {}
  }

  const vs = useLiveVsSpy(featured?.holdings ?? [], { fallback: featured?.vsSpy ?? null });
  const summary = vs == null ? "No mark vs S&P 500 yet." : `${fmtVsLabel(vs)} vs S&P 500.`;

  if (!visible.length) {
    return (
      <EmptyState
        title={q ? "No matches" : "No takes yet"}
        body={q ? "Try another search." : "Write a take. The agent finds the companies."}
        action={
          <Link href="/app/compose">
            <Button variant="primary">Write a take</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="display text-[28px] md:text-[32px]">Desk</h1>
      </header>
      {stale ? <p className="text-[13px] text-caution">Reconnecting. Last marks shown.</p> : null}

      {proposals.length ? (
        <section className="rounded-[24px] bg-ink p-5 text-white">
          <h2 className="display text-[20px]">Needs your OK</h2>
          <ul className="mt-3 space-y-3">
            {proposals.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-white/10 px-4 py-3">
                <div>
                  <p className="font-medium">{p.sentence ?? "Take"}</p>
                  <p className="text-[13px] text-white/70">{proposalLine(p.trades)}</p>
                </div>
                <div className="flex gap-2">
                  <Button variant="lime" onClick={() => void act(p.id, "approve")}>
                    Approve
                  </Button>
                  <Button variant="ghost" className="text-white ring-white/20" onClick={() => void act(p.id, "skip")}>
                    Skip
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="mesh-forest overflow-hidden rounded-[32px] p-6 text-white md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[13px] text-mint">vs S&P 500</p>
            <h2 className="view mt-2 text-[20px] font-medium leading-snug tracking-[-0.02em] md:text-[24px]">{featured?.sentence}</h2>
            <p className="mt-2 text-[14px] text-white/70">{agentByTake[featured?.id ?? ""] ?? (featured?.seeded ? "Seeded view. Chart history is illustrative until live marks fill in." : "Waiting on the first agent review.")}</p>
            <p className="num mt-3 text-[28px] font-semibold text-lime">
              <TickValue value={vs} format={(n) => fmtVsLabel(n, 2)} color="sign" className="text-[28px] font-semibold text-lime" />
            </p>
          </div>
          <SegmentedTabs options={RANGES} value={range} onChange={(v) => setRange(v as (typeof RANGES)[number])} layoutId="range" />
        </div>
        <div className="mt-6 rounded-[20px] bg-white/95 p-4 text-ink">
          <StatStrip
            items={[
              { label: "Take", value: vs != null ? 100 + vs * 100 : null, color: "#0f9d63" },
              { label: "S&P 500", value: 100, color: "#4a6356" },
              { label: "Spread", value: vs != null ? vs * 100 : null, delta: vs, color: "#0e2a1f" }
            ]}
          />
          <div className="mt-4">
            <VsChart points={points} liveVs={vs} range={range} summary={summary} />
          </div>
          <Link className="mt-3 inline-flex min-h-11 items-center font-medium" href={`/app/takes/${featured?.id}`}>
            Open take →
          </Link>
        </div>
      </section>

      <div className="hide-scroll flex gap-3 overflow-x-auto">
        {[...(featured?.holdings ?? [])]
          .sort((a, b) => (b.chgPct ?? -Infinity) - (a.chgPct ?? -Infinity))
          .slice(0, 8)
          .map((h) => (
            <MoverCard key={h.symbol} symbol={h.symbol} last={h.last} chgPct={h.chgPct} />
          ))}
      </div>

      <section className="panel divide-y divide-line p-2">
        <p className="px-4 pt-3 text-[13px] font-medium text-muted">Board</p>
        {visible.map((t) => (
          <button
            key={t.id}
            className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left hover:bg-canvas/70"
            onClick={() => setSelected(t.id)}
          >
            <div>
              <p className="font-medium">{t.sentence}</p>
              <p className="text-[13px] text-muted">
                {t.author} · {t.backers ?? t.dryRun} backing
                {proposals.some((p) => p.takeId === t.id) ? " · Proposal waiting" : ""}
              </p>
            </div>
            <DeltaPill value={t.vsSpy} />
          </button>
        ))}
      </section>

      <section className="panel p-5">
        <h3 className="text-[16px] font-semibold">Portfolio</h3>
        <div className="mt-2">
          {(featured?.holdings ?? []).map((h) => (
            <HoldingRow key={h.symbol} symbol={h.symbol} weightBps={h.weightBps} last={h.last} chgPct={h.chgPct} rationale={h.rationale} />
          ))}
        </div>
      </section>
    </div>
  );
}

function visisibleSafe(visible: TakeRow[], selected: string) {
  return visible.find((t) => t.id === selected) ?? visible[0];
}
