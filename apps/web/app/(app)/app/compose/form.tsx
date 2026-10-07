"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useReducedMotion } from "motion/react";
import {
  ArrowRight,
  MagnifyingGlass,
  ShareNetwork,
  Scales,
  ShieldCheck,
  X,
  PencilSimple,
  Paperclip,
  Bank,
  PaperPlaneTilt
} from "@phosphor-icons/react";
import { useAuth } from "@/components/auth-provider";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { Button } from "@/components/ui/button";
import { Composer, SkyComposer } from "@/components/social/composer";
import { ComposeChooser } from "@/components/social/compose-chooser";
import { SkyThesis } from "@/components/social/sky-thesis";
import { type StreamItem } from "@/components/social/research-stream";
import { HoldingRow } from "@/components/data/holding-row";
import { AllocationBar } from "@/components/data/allocation-bar";
import { Notice } from "@/components/ui/surface";
import { RadioCard } from "@/components/glass/radio-card";
import { AgentOrb } from "@/components/glass/agent-orb";
import { Wordmark } from "@/components/brand";
import { OrbitField } from "@/components/research/orbit-field";
import { ResearchLiveLog } from "@/components/research/live-log";
import { ApiError } from "@/lib/api";
import { API_ORIGIN } from "@/lib/fmt";
import { useWorld } from "@/lib/world";

type Holding = { tokenId: string; symbol: string; weightBps: number; rationale?: string; role?: string };

const STAGES = [
  {
    id: "read",
    icon: MagnifyingGlass,
    stat: "Reading the catalog",
    headline: "Reading the world through your words",
    sentence: "Scanning a universe of tokenized companies for the ones your view actually touches.",
    check: "Understood your view"
  },
  {
    id: "trace",
    icon: ShareNetwork,
    stat: "Tracing the value chain",
    headline: "Tracing who wins if you’re right",
    sentence: "Following the money from direct beneficiaries to the quieter suppliers behind them.",
    check: "Mapped the value chain"
  },
  {
    id: "weigh",
    icon: Scales,
    stat: "Weighing the names",
    headline: "Sizing conviction, not hype",
    sentence: "Weighting each company by how closely its fortunes track your thesis.",
    check: "Weighted the basket"
  },
  {
    id: "hedge",
    icon: ShieldCheck,
    stat: "Checking the risk",
    headline: "Planning for being wrong",
    sentence: "Adding a steadier name so one bad quarter doesn’t sink the whole view.",
    check: "Balanced the risk"
  }
];

const STOCK_HINTS = [
  "Diseases are going to increase.",
  "The future of travel is closer than we think.",
  "The world will need a lot more electricity."
];
const MEME_HINTS = [
  "Dogs still run the timeline.",
  "Launchpads mint a new culture coin every night.",
  "Frogs and cats keep winning attention."
];
const SKY_HINTS = [
  "Saturn transits the 10th. Labor stays expensive.",
  "Mars enters Scorpio. Saturn aspects the 10th.",
  "Sun ingresses Capricorn. Jupiter-Saturn still tight."
];
const PAPER_PRESETS = [100, 250, 500, 1000];

function stageIndex(events: StreamItem[]) {
  const last = events[events.length - 1]?.stage ?? "";
  if (/draft|done|portfolio|critic/i.test(last)) return 4;
  if (/analyst|diligence|discover/i.test(last)) return 2;
  if (/screen|catalog|retrieve/i.test(last)) return 1;
  if (/interpret|queued|research/i.test(last)) return 0;
  return Math.min(3, Math.floor(events.length / 4));
}

function FlowTopBar({ action }: { action?: ReactNode }) {
  return (
    <header className="mx-auto flex h-16 w-full max-w-[1100px] items-center justify-between px-5 md:px-8">
      <Wordmark href="/app" />
      {action}
    </header>
  );
}

function formatMoney(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: n % 1 ? 2 : 0 })}`;
}

export default function ComposeForm() {
  const router = useRouter();
  const fetchApi = useAuthedFetch();
  const { getHeaders } = useAuth();
  const reduce = useReducedMotion();
  const fork = useSearchParams().get("fork");
  const lensParam = useSearchParams().get("lens");
  const { world, setWorld, chainId, setChainId } = useWorld();
  const [lens, setLens] = useState<"BELIEF" | "SKY">(lensParam === "sky" ? "SKY" : "BELIEF");
  const [astrologySystem, setAstrologySystem] = useState<"VEDIC" | "WESTERN">("VEDIC");
  const [chart, setChart] = useState("");
  const hints = lens === "SKY" ? SKY_HINTS : world === "MEMES" ? MEME_HINTS : STOCK_HINTS;
  const [sentence, setSentence] = useState("");
  const [takeId, setTakeId] = useState("");
  const [runId, setRunId] = useState("");
  const [events, setEvents] = useState<StreamItem[]>([]);
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [thesis, setThesis] = useState("");
  const [error, setError] = useState("");
  const [suggestWorld, setSuggestWorld] = useState<"STOCKS" | "MEMES" | null>(null);
  const [busy, setBusy] = useState(false);
  const [amount, setAmount] = useState("250");
  const [reveal, setReveal] = useState(false);
  const [invested, setInvested] = useState<{ takeId: string; usd: number } | null>(null);
  const [step, setStep] = useState<"basket" | "invest">("basket");
  const [wantReal, setWantReal] = useState(false);
  const [liveOk, setLiveOk] = useState(false);
  const typeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (lensParam === "sky") setLens("SKY");
  }, [lensParam]);

  useEffect(() => {
    fetchApi<{ liveEnabled?: boolean; wallet?: { id?: string } }>("/v1/wallet")
      .then((d) => setLiveOk(Boolean(d.liveEnabled && d.wallet)))
      .catch(() => setLiveOk(false));
  }, [fetchApi]);

  useEffect(() => {
    const stored = sessionStorage.getItem("superview-draft");
    if (stored) setSentence(stored);
  }, []);

  useEffect(() => {
    if (!fork) return;
    fetchApi<{ take: { lens?: string; astrologySystem?: string; revisions?: Array<{ sentence: string; astrologyChart?: string | null }> } }>(`/v1/takes/${fork}`)
      .then((d) => {
        const r = d.take?.revisions?.[0];
        setSentence(r?.sentence ?? "");
        if (d.take?.lens === "SKY" || r?.astrologyChart) {
          setLens("SKY");
          setChart(r?.astrologyChart ?? "");
          if (d.take?.astrologySystem === "WESTERN") setAstrologySystem("WESTERN");
        }
      })
      .catch(() => {});
  }, [fetchApi, fork]);

  useEffect(
    () => () => {
      if (typeTimer.current) window.clearInterval(typeTimer.current);
    },
    []
  );

  const researching = busy && !holdings.length && !error;
  const idx = useMemo(() => stageIndex(events), [events]);
  const shown = Math.min(idx + 1, STAGES.length);

  function typeInto(full: string) {
    if (typeTimer.current) window.clearInterval(typeTimer.current);
    const set = lens === "SKY" ? setChart : setSentence;
    if (reduce) {
      set(full);
      return;
    }
    let i = 0;
    set("");
    typeTimer.current = window.setInterval(() => {
      i += 2;
      set(full.slice(0, i));
      if (i >= full.length && typeTimer.current) {
        window.clearInterval(typeTimer.current);
        typeTimer.current = null;
      }
    }, 14);
  }

  async function research() {
    setError("");
    setBusy(true);
    setEvents([]);
    setHoldings([]);
    setStep("basket");
    sessionStorage.setItem("superview-draft", lens === "SKY" ? chart : sentence);
    try {
      const started = await fetchApi<{ takeId: string; runId: string }>("/v1/research", {
        method: "POST",
        body: JSON.stringify({
          sentence,
          world,
          chainId,
          parentTakeId: fork || undefined,
          lens,
          astrologySystem: lens === "SKY" ? astrologySystem : undefined,
          chart: lens === "SKY" ? chart : undefined
        })
      });
      setTakeId(started.takeId);
      setRunId(started.runId);
      const headers = await getHeaders();
      const res = await fetch(`${API_ORIGIN}/v1/research/${started.runId}/stream`, { headers: headers as HeadersInit });
      if (!res.body) throw new Error("no stream");
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            const ev = JSON.parse(line.slice(6)) as StreamItem & { status?: string; payload?: { holdings?: Holding[]; thesis?: string; suggestWorld?: "STOCKS" | "MEMES" } };
            setEvents((prev) => [...prev, { stage: ev.stage, message: ev.message }]);
            if (ev.payload?.holdings) setHoldings(ev.payload.holdings);
            if (ev.payload?.thesis) setThesis(String(ev.payload.thesis));
            if (ev.payload?.suggestWorld && ev.payload.suggestWorld !== world) setSuggestWorld(ev.payload.suggestWorld);
            if (ev.stage === "done" || ev.stage === "draft" || ev.stage === "refuse" || ev.stage === "failed") {
              if (ev.stage === "refuse" || ev.stage === "failed") setError(ev.message || "Couldn’t research that view.");
            }
          } catch {
            /* ignore malformed */
          }
        }
      }
      const done = await fetchApi<{
        portfolio: { ok?: boolean; holdings?: Holding[] };
        spec?: { interpretation?: string };
        run?: { error?: string; status?: string };
      }>(`/v1/research/${started.runId}`);
      if (done.portfolio && "holdings" in done.portfolio && done.portfolio.holdings) {
        setHoldings(done.portfolio.holdings);
      }
      if (done.spec?.interpretation) setThesis(done.spec.interpretation);
      if (done.run?.status === "FAILED") setError(done.run.error || "Couldn’t research that view.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setError("Sign in to ask the agent.");
      else if (e instanceof ApiError && e.status === 503) setError("Research isn’t configured.");
      else setError("Couldn’t research that view. Try again.");
    }
    setBusy(false);
  }

  async function publish(invest: boolean) {
    if (!takeId) return;
    const usd = Number(amount);
    if (invest && (!Number.isFinite(usd) || usd < 1)) {
      setError("Enter how much paper you want in this view.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await fetchApi(`/v1/takes/${takeId}/publish`, { method: "POST" });
      if (invest) {
        try {
          const backed = await fetchApi<{ pocket?: { id: string }; invest?: { fills?: number; orderId?: string } }>(
            `/v1/takes/${takeId}/back`,
            {
              method: "POST",
              body: JSON.stringify({
                level: wantReal && liveOk ? "LIVE" : "DRY_RUN",
                mandateMode: "AUTO",
                amountUsd: usd,
                revealAmount: reveal
              })
            }
          );
          if (backed.pocket?.id && !backed.invest?.fills) {
            await fetchApi(
              wantReal && liveOk ? `/v1/pockets/${backed.pocket.id}/live-invest` : `/v1/pockets/${backed.pocket.id}/dry-run-invest`,
              { method: "POST", body: JSON.stringify({ amountUsd: usd }) }
            );
          }
        } catch {
          /* view is live; paper fill can lag */
        }
        setInvested({ takeId, usd });
        setBusy(false);
        return;
      }
      router.push(`/app/takes/${takeId}`);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setError("Sign in to publish.");
      else setError("Couldn’t publish. Try again.");
    }
    setBusy(false);
  }

  if (researching) {
    return (
      <div className="research-dark fixed inset-0 overflow-hidden bg-abyss text-white" id="main">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/research-planet.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-left" />
        <div className="absolute inset-0 bg-gradient-to-b from-abyss/55 via-abyss/25 to-abyss/70" />
        <OrbitField tickers={holdings.map((h) => h.symbol)} />
        <div className="relative flex h-full flex-col px-5 py-6 md:px-10 md:py-8">
          <div className="flex items-center justify-between gap-4">
            <span className="glass-night inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] uppercase tracking-[0.08em] text-white/90">
              <span className="relative flex h-2 w-2">
                <span className="absolute inset-0 animate-ping rounded-full bg-aqua/70" />
                <span className="relative h-2 w-2 rounded-full bg-aqua" />
              </span>
              Agent running
            </span>
            <button
              type="button"
              onClick={() => setBusy(false)}
              className="rounded-full px-4 py-2 text-[13px] font-medium text-white/80 hover:bg-white/10 hover:text-white"
            >
              Cancel
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-start justify-end pt-8 md:pt-14">
            <ResearchLiveLog events={events} world={world} chainId={chainId} />
          </div>
          <div className="glass-night flex items-center gap-4 rounded-2xl px-5 py-4 md:gap-6">
            <p className="min-w-0 flex-1 truncate text-[15px] font-medium text-white/90">
              “{(lens === "SKY" ? chart || sentence : sentence).trim()}”
            </p>
            <div className="hidden h-1 w-40 overflow-hidden rounded-full bg-white/10 sm:block">
              <div className="h-full rounded-full bg-lagoon transition-all duration-300" style={{ width: `${Math.min(shown, 4) / 4 * 100}%` }} />
            </div>
            <span className="shrink-0 font-mono text-[13px] text-white/80">
              {events.length ? `${events.length} notes` : "waiting"}
            </span>
          </div>
        </div>
      </div>
    );
  }

  if (holdings.length) {
    const usd = Number(amount);
    const valid = Number.isFinite(usd) && usd >= 1;
    return (
      <div className="flow-page min-h-screen w-full">
        <FlowTopBar
          action={
            <Button
              variant="quiet"
              size="sm"
              onClick={() => {
                setHoldings([]);
                setStep("basket");
              }}
            >
              <PencilSimple size={16} />
              Edit view
            </Button>
          }
        />
        <main id="main" className="mx-auto w-full max-w-[760px] px-5 pb-40 pt-6 md:pt-12">
          <p className="flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-muted">
            <AgentOrb size={16} />
            Research complete
          </p>
          {lens === "SKY" ? (
            <SkyThesis
              size="page"
              chart={chart}
              prediction={sentence.trim() || thesis || "Untitled view"}
            />
          ) : (
            <>
              <h1 className="view mt-5 text-[22px] font-medium leading-snug tracking-[-0.02em] text-ink md:text-[28px]">“{sentence.trim()}”</h1>
              {thesis ? <p className="mt-3 text-[15px] text-muted">{thesis}</p> : null}
            </>
          )}
          {error ? (
            <div className="mt-6">
              <Notice tone="warn">{error}</Notice>
            </div>
          ) : null}

          <section className="glass-card mt-10 rounded-[28px] p-6 md:p-8">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="display text-[20px] text-ink">Your basket</h2>
              <p className="text-[13px] text-muted">
                <span className="font-mono">{holdings.length}</span> {world === "MEMES" ? "coins" : "companies"}
              </p>
            </div>
            <div className="mt-6">
              <AllocationBar parts={holdings} />
            </div>
            <div className="mt-4">
              {holdings.map((h) => (
                <HoldingRow
                  key={h.tokenId}
                  symbol={h.symbol}
                  weightBps={h.weightBps}
                  rationale={h.rationale}
                  role={h.role}
                  takeId={takeId}
                  whyInBasket={h.rationale}
                  chainId={chainId}
                />
              ))}
            </div>
          </section>
          <p className="mt-6 text-[13px] text-muted">
            {world === "MEMES"
              ? "Memes can go to zero. Liquidity can vanish. This is not investment advice."
              : "Weights and performance are illustrative. Stock tokens are economic exposure, not share ownership."}
          </p>

          {step === "invest" ? (
            <section className="mt-12">
              <p className="text-[13px] font-medium text-muted">Invest in this view</p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-mist px-2.5 py-1 text-[12px] font-medium text-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                {wantReal && liveOk ? "Live USDG" : "Paper · no real money"}
              </span>
              {liveOk ? (
                <div className="mt-4 flex gap-2">
                  <button type="button" onClick={() => setWantReal(false)} className={`h-8 rounded-full px-3 text-[12px] ${!wantReal ? "bg-mist text-ink" : "text-muted"}`}>
                    Paper
                  </button>
                  <button type="button" onClick={() => setWantReal(true)} className={`h-8 rounded-full px-3 text-[12px] ${wantReal ? "bg-mist text-ink" : "text-muted"}`}>
                    Live USDG
                  </button>
                </div>
              ) : null}
              <label htmlFor="paper-amount" className="mt-8 block text-[13px] text-muted">
                Amount
              </label>
              <div className="mt-1 flex items-baseline border-b border-teal/15 pb-2 focus-within:border-teal/50">
                <span className="figure text-[40px] text-muted">$</span>
                <input
                  id="paper-amount"
                  autoFocus
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").slice(0, 9))}
                  className="figure w-full min-w-0 bg-transparent text-[40px] text-ink focus:outline-none"
                />
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                {PAPER_PRESETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => setAmount(String(n))}
                    aria-pressed={usd === n}
                    className={`h-9 rounded-full border px-4 font-mono text-[13px] ${
                      usd === n ? "border-teal/40 bg-mist text-ink" : "border-teal/15 bg-glass/70 text-muted hover:text-ink"
                    }`}
                  >
                    ${n.toLocaleString("en-US")}
                  </button>
                ))}
              </div>
              <div className="mt-6">
                <label className="flex items-start gap-3 text-[13px] text-ink">
                  <input
                    type="checkbox"
                    checked={reveal}
                    onChange={(e) => setReveal(e.target.checked)}
                    className="mt-0.5 size-4 accent-teal"
                  />
                  Show this amount on my view
                </label>
              </div>
            </section>
          ) : liveOk ? (
            <>
              <section className="mt-12">
                <h2 className="text-[15px] font-medium text-ink">Investing mode</h2>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <RadioCard
                    name="invest-mode"
                    checked={!wantReal}
                    onSelect={() => setWantReal(false)}
                    title="Paper"
                    description="Live marks without live money."
                    icon={<Paperclip size={16} className="text-teal" />}
                  />
                  <RadioCard
                    name="invest-mode"
                    checked={wantReal}
                    onSelect={() => setWantReal(true)}
                    title="Live USDG"
                    description="Spend real USDG from your Privy wallet."
                    icon={<Bank size={16} className="text-muted" />}
                  />
                </div>
              </section>
            </>
          ) : null}
          {runId ? <p className="mt-8 text-[12px] text-muted">Run {runId.slice(-8)}</p> : null}
        </main>
        <div className="fixed inset-x-0 bottom-0 z-30 px-3 pb-3">
          <div className="glass-chrome mx-auto flex max-w-[760px] items-center justify-between gap-3 rounded-2xl p-3">
            {step === "invest" ? (
              <>
                <Button variant="ghost" size="lg" onClick={() => setStep("basket")}>
                  Back
                </Button>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button variant="ghost" size="lg" onClick={() => void publish(false)} disabled={busy}>
                    Publish without investing
                  </Button>
                  <Button size="lg" variant="primary" disabled={busy || !valid} onClick={() => void publish(true)}>
                    {busy ? "Publishing…" : valid ? `Invest ${formatMoney(usd)}${wantReal && liveOk ? " USDG" : " paper"}` : "Invest"}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="lg"
                  onClick={() => {
                    setHoldings([]);
                    setStep("basket");
                  }}
                >
                  Edit view
                </Button>
                <Button size="lg" variant="primary" onClick={() => setStep("invest")} disabled={wantReal && !liveOk}>
                  <PaperPlaneTilt size={16} />
                  Continue
                </Button>
              </>
            )}
          </div>
        </div>
        {invested ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6">
            <div className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" />
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="invested-title"
              className="glass-sheet relative max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] p-6 pb-8 text-center md:max-w-[480px] md:rounded-[28px] md:p-8"
            >
              <h2 id="invested-title" className="display text-[28px] text-ink">
                You’re invested
              </h2>
              <p className="mt-2 text-[15px] text-muted">
                <span className="font-mono text-ink">{formatMoney(invested.usd)}</span> of paper money is now tracking
              </p>
              <p className="mt-4 text-[16px] font-medium leading-snug text-ink">
                “{(sentence.trim() || chart.trim() || "this sky")}”
              </p>
              <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-mist px-2.5 py-1 text-[12px] font-medium text-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                Paper · no real money
              </span>
              <Button
                className="mt-8"
                size="lg"
                variant="primary"
                fullWidth
                onClick={() => router.push(`/app/takes/${invested.takeId}`)}
              >
                See this view
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flow-page min-h-screen w-full">
      <FlowTopBar
        action={
          <Button variant="quiet" size="sm" onClick={() => router.push("/app")} aria-label="Close composer">
            <X size={16} />
            Close
          </Button>
        }
      />
      <main id="main" className="mx-auto w-full max-w-[760px] px-5 pb-20 pt-8 md:pt-16">
        <h1 className="display text-[28px] text-ink md:text-[40px]">
          {lens === "SKY" ? "What’s in the sky?" : "What’s your view on the world?"}
        </h1>
        <p className="mt-3 text-[15px] text-muted">
          {fork
            ? "Starting from another view. Make it yours."
            : lens === "SKY"
              ? "Write the transits, dashas, or ingresses. The agent reads Vedic or Western canon, predicts market themes, then builds a basket from this desk."
              : world === "MEMES"
                ? "Write it in one sentence. The agent will find launchpad coins that fit. Memes are high risk and can go to zero."
                : "Write it in one sentence. The agent will find the companies it touches."}
        </p>
        <ComposeChooser
          lens={lens}
          world={world}
          chainId={chainId}
          system={astrologySystem}
          onLens={setLens}
          onWorld={setWorld}
          onChain={setChainId}
          onSystem={setAstrologySystem}
        />
        {suggestWorld ? (
          <div className="mt-4">
            <Notice tone="warn">
              This reads like a {suggestWorld === "MEMES" ? "launchpad" : "stocks"} view.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => {
                  setWorld(suggestWorld);
                  setSuggestWorld(null);
                }}
              >
                Switch to {suggestWorld === "MEMES" ? "Memes" : "Stocks"}
              </button>
            </Notice>
          </div>
        ) : null}
        <div className="mt-10">
          {lens === "SKY" ? (
            <SkyComposer
              chart={chart}
              headline={sentence}
              onChart={setChart}
              onHeadline={setSentence}
              onSubmit={() => void research()}
              busy={busy}
            />
          ) : (
            <Composer value={sentence} onChange={setSentence} onSubmit={() => void research()} busy={busy} autoFocus />
          )}
        </div>
        {error ? (
          <div className="mt-4">
            <Notice tone="warn">{error}</Notice>
          </div>
        ) : null}
        <section className="mt-12">
          <h2 className="text-[13px] font-medium text-ink">A little inspiration</h2>
          <div className="mt-4 flex flex-wrap gap-2">
            {hints.map((ex) => (
              <button
                key={ex}
                type="button"
                onClick={() => typeInto(ex)}
                className="rounded-full border border-teal/15 bg-glass/70 px-4 py-2 text-left text-[13px] text-ink transition-colors hover:border-teal/35 hover:bg-glass"
              >
                {ex}
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
