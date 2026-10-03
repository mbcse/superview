"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { PaperPlaneTilt } from "@phosphor-icons/react";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { Button } from "@/components/ui/button";
import { Chip, EmptyState, Notice, Surface } from "@/components/ui/surface";
import { fmtUsd, orderStatusLabel, skipReason, tick } from "@/lib/fmt";
import { proposalLine } from "@/lib/agent-copy";
import { AllocationBar } from "@/components/data/allocation-bar";
import { AnimatedNumber } from "@/components/data/animated-number";
import { DeltaPill } from "@/components/data/delta-pill";
import { HoldingRow } from "@/components/data/holding-row";
import { useQuoteBook } from "@/components/social/price-stream";

type Leg = {
  symbol?: string;
  qty?: number;
  last?: number | null;
  mtm?: number | null;
  pnl?: number | null;
};

function liveLast(quotes: ReturnType<typeof useQuoteBook>, symbol?: string, fallback?: number | null) {
  if (!symbol) return fallback ?? null;
  const u = symbol.toUpperCase();
  const bare = tick(u).toUpperCase();
  return quotes[u]?.last ?? quotes[bare]?.last ?? quotes[`RH${bare}`]?.last ?? fallback ?? null;
}

function PocketChat({
  pocketId,
  initial,
  fetchApi
}: {
  pocketId: string;
  initial: Array<{ id: string; body: string; authorType: string; createdAt: string }>;
  fetchApi: ReturnType<typeof useAuthedFetch>;
}) {
  const [messages, setMessages] = useState(initial);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = body.trim();
    if (!text) return;
    setBusy(true);
    try {
      const r = await fetchApi<{ user: { id: string; body: string; authorType: string; createdAt: string }; agent: { id: string; body: string; authorType: string; createdAt: string } | null }>(
        `/v1/pockets/${pocketId}/chat`,
        { method: "POST", body: JSON.stringify({ body: text }) }
      );
      setMessages((m) => [...m, r.user, ...(r.agent ? [r.agent] : [])]);
      setBody("");
    } catch {
      /* keep draft */
    }
    setBusy(false);
  }

  return (
    <div className="mt-5 rounded-[16px] border border-teal/10 bg-canvas/60 p-4">
      <p className="text-[13px] font-medium text-ink">Chat with your agent</p>
      <ul className="mt-3 max-h-56 space-y-2 overflow-y-auto text-[14px]">
        {messages.map((m) => (
          <li key={m.id} className={m.authorType === "AGENT" ? "text-ink" : "text-muted"}>
            <span className="text-[11px] uppercase tracking-[0.06em] text-teal">{m.authorType === "AGENT" ? "Agent" : "You"}</span>
            <p className="mt-0.5">{m.body}</p>
          </li>
        ))}
      </ul>
      <form
        className="mt-3 flex items-end gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <input
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Tell the agent…"
          className="min-h-10 min-w-0 flex-1 rounded-xl border border-teal/15 bg-glass/70 px-3 text-[14px] text-ink placeholder:text-muted focus:border-teal/50 focus:outline-none"
        />
        <Button type="submit" size="icon" variant="primary" disabled={busy || !body.trim()} aria-label="Send">
          <PaperPlaneTilt size={16} />
        </Button>
      </form>
    </div>
  );
}

function PocketCard({
  p,
  fetchApi,
  setNotice,
  setRows
}: {
  p: any;
  fetchApi: ReturnType<typeof useAuthedFetch>;
  setNotice: (v: string | null) => void;
  setRows: Dispatch<SetStateAction<any[]>>;
}) {
  const quotes = useQuoteBook();
  const sentence = p.take?.revisions?.[0]?.sentence ?? "Take";
  const last = p.orders?.[0];
  const legs: Leg[] = p.mark?.legs ?? [];
  const pending = (p.proposals ?? []).filter((x: any) => x.status === "PENDING");
  const approval = p.mandate?.mode !== "AUTO";
  const cashUsd = Number(p.mark?.cashUsd ?? 0);
  const hasPosition = legs.some((l) => (l.qty ?? 0) > 0);
  const livePositions = legs.reduce((s, l) => {
    const lastPx = liveLast(quotes, l.symbol, l.last);
    const qty = l.qty ?? 0;
    if (lastPx != null && qty) return s + lastPx * qty;
    return s + Number(l.mtm ?? 0);
  }, 0);
  const nav = cashUsd + livePositions || Number(p.navUsd ?? p.mark?.navUsd);
  const cost = legs.reduce((s, l: any) => s + Number(l.cost ?? 0), 0);
  const pnl = livePositions - cost || p.unrealizedUsd || p.mark?.unrealizedUsd;
  const weightOf = (leg: Leg) =>
    nav > 0 ? Math.round((((liveLast(quotes, leg.symbol, leg.last) ?? 0) * (leg.qty ?? 0) || Number(leg.mtm ?? 0)) / nav) * 10_000) : 0;

  return (
    <Surface className="p-6">
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <div className="flex flex-wrap gap-2">
            <Chip tone={p.mode === "LIVE" ? "live" : "paper"}>{p.mode === "DRY_RUN" ? "Paper · not real money" : p.mode === "LIVE" ? "Live" : "Watch"}</Chip>
            <Chip>{approval ? "Ask me first" : "Agent"}</Chip>
          </div>
          <h2 className="view mt-3 text-[16px] font-medium leading-snug tracking-[-0.015em] text-ink">
            <Link href={`/app/takes/${p.takeId}`}>{sentence}</Link>
          </h2>
          {last ? (
            <p className="mt-2 text-[13px] text-muted">
              <Link href={`/app/order/${last.id}`}>Last order · {orderStatusLabel(last.status)}</Link>
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <p className="text-[13px] text-muted">Value</p>
          <p className="figure text-[28px]">
            <AnimatedNumber value={nav} format={(n) => fmtUsd(n)} />
          </p>
          <div className="mt-1 flex justify-end">
            <DeltaPill value={nav && pnl != null ? pnl / Math.max(1, nav) : null} />
          </div>
        </div>
      </div>
      {legs.length ? (
        <div className="mt-5">
          <AllocationBar parts={legs.map((l) => ({ symbol: l.symbol ?? "", weightBps: weightOf(l) }))} />
          <div className="mt-2">
            {legs.map((leg) => (
              <HoldingRow
                key={leg.symbol}
                symbol={leg.symbol ?? ""}
                weightBps={weightOf(leg)}
                last={liveLast(quotes, leg.symbol, leg.last)}
                takeId={p.takeId}
              />
            ))}
          </div>
        </div>
      ) : null}
      {pending.map((pr: any) => (
        <div key={pr.id} className="mt-4 rounded-[16px] bg-canvas px-4 py-3">
          <p className="text-[14px]">{proposalLine(pr.trades)}</p>
          <div className="mt-3 flex gap-2">
            <Button
              variant="primary"
              onClick={async () => {
                await fetchApi(`/v1/proposals/${pr.id}/approve`, { method: "POST" });
                setNotice("Approved.");
                setRows((all) => all.map((x) => (x.id === p.id ? { ...x, proposals: x.proposals.filter((y: any) => y.id !== pr.id) } : x)));
              }}
            >
              Approve
            </Button>
            <Button
              variant="ghost"
              onClick={async () => {
                await fetchApi(`/v1/proposals/${pr.id}/skip`, { method: "POST" });
                setNotice("Skipped.");
                setRows((all) => all.map((x) => (x.id === p.id ? { ...x, proposals: x.proposals.filter((y: any) => y.id !== pr.id) } : x)));
              }}
            >
              Skip
            </Button>
          </div>
        </div>
      ))}
      {last ? (
        <p className="mt-3 text-[13px] text-muted">
          Last order {orderStatusLabel(last.status)}
          {last.legs?.some((l: any) => l.skipReason) ? ` · ${skipReason(last.legs.find((l: any) => l.skipReason)?.skipReason)}` : ""}
        </p>
      ) : null}
      <div className="mt-4 flex flex-wrap gap-2">
        {!hasPosition && p.mode === "DRY_RUN" ? (
          <Button
            variant="primary"
            onClick={async () => {
              const j = await fetchApi<any>(`/v1/pockets/${p.id}/dry-run-invest`, { method: "POST" });
              setNotice(`${orderStatusLabel(j.status)} — ${j.fills ?? 0} names filled.`);
              if (j.orderId) location.href = `/app/order/${j.orderId}`;
            }}
          >
            Put paper into this basket
          </Button>
        ) : null}
        <Button
          variant="ghost"
          onClick={async () => {
            const next = approval ? "AUTO" : "APPROVAL";
            const j = await fetchApi<{ mandate: { mode: string } }>(`/v1/pockets/${p.id}/mandate`, {
              method: "POST",
              body: JSON.stringify({ mode: next })
            });
            setRows((all) => all.map((x) => (x.id === p.id ? { ...x, mandate: { ...x.mandate, mode: j.mandate.mode } } : x)));
          }}
        >
          {approval ? "Let the agent run" : "Ask me first"}
        </Button>
      </div>
      <PocketChat pocketId={p.id} initial={p.chats ?? []} fetchApi={fetchApi} />
    </Surface>
  );
}

export default function PocketsClient({ pockets }: { pockets: any[] }) {
  const fetchApi = useAuthedFetch();
  const params = useSearchParams();
  const funded = params.get("paper");
  const [notice, setNotice] = useState<string | null>(
    funded ? `Published. $${Number(funded).toLocaleString()} paper is in this view — not real money.` : null
  );
  const [rows, setRows] = useState(pockets);

  useEffect(() => {
    const id = window.setInterval(() => {
      fetchApi<{ pockets: any[] }>("/v1/pockets")
        .then((d) => setRows(d.pockets ?? []))
        .catch(() => {});
    }, 12000);
    return () => window.clearInterval(id);
  }, [fetchApi]);

  if (!rows.length) {
    return (
      <div>
        <EmptyState
          title="Your next conviction starts here"
          body="Put paper money behind a view you believe in, and track it here."
          action={
            <Link href="/app/trending">
              <Button variant="primary">Find a view</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const total = rows.reduce((s, p) => s + Number(p.navUsd ?? p.mark?.navUsd ?? 0), 0);

  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted">Paper allocated</p>
      <p className="figure mt-2 text-[40px] text-ink md:text-[56px]">
        <AnimatedNumber value={total} format={(n) => fmtUsd(n)} />
      </p>
      <p className="mt-3 text-[13px] text-muted">
        Tracking <span className="font-mono text-ink">{rows.length}</span> {rows.length === 1 ? "pocket" : "pockets"}
      </p>
      <h2 className="display mt-12 text-[20px] text-ink">Your pockets</h2>
      {notice ? <div className="mt-4"><Notice tone="ok">{notice}</Notice></div> : null}
      <div className="mt-4 space-y-4">
      {rows.map((p) => (
        <PocketCard key={p.id} p={p} fetchApi={fetchApi} setNotice={setNotice} setRows={setRows} />
      ))}
      </div>
    </div>
  );
}
