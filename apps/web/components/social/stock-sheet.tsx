"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "@phosphor-icons/react";
import { useLiveQuote } from "@/components/social/price-stream";
import { Spark } from "@/components/charts/spark";
import { RoleChip } from "@/components/social/role-chip";
import { SegmentedTabs } from "@/components/data/segmented-tabs";
import { fmtPx, fmtPct, tick, API_ORIGIN } from "@/lib/fmt";
import { Button } from "@/components/ui/button";
import { TickValue } from "@/components/data/tick-value";

export type StockMeta = {
  takeId?: string;
  rationale?: string | null;
  role?: string | null;
  weightBps?: number | null;
  whyInBasket?: string | null;
};

const PERIODS = ["1D", "1M", "1Y"] as const;

const Ctx = createContext<{
  openStock: (symbol: string, meta?: StockMeta) => void;
  closeStock: () => void;
}>({ openStock: () => {}, closeStock: () => {} });

export function useStockSheet() {
  return useContext(Ctx);
}

export function StockSheetProvider({ children }: { children: ReactNode }) {
  const [symbol, setSymbol] = useState<string | null>(null);
  const [meta, setMeta] = useState<StockMeta>({});
  function openStock(next: string, nextMeta?: StockMeta) {
    setSymbol(next);
    setMeta(nextMeta ?? {});
  }
  return (
    <Ctx.Provider value={{ openStock, closeStock: () => setSymbol(null) }}>
      {children}
      <StockSheet symbol={symbol} meta={meta} onClose={() => setSymbol(null)} />
    </Ctx.Provider>
  );
}

type TokenCard = {
  name?: string | null;
  legalName?: string | null;
  sector?: string | null;
  industry?: string | null;
  logoUrl?: string | null;
  about?: string | null;
  filling?: boolean;
};

function StockSheet({ symbol, meta, onClose }: { symbol: string | null; meta: StockMeta; onClose: () => void }) {
  const quote = useLiveQuote(symbol ?? undefined);
  const reduce = useReducedMotion();
  const name = symbol ? tick(symbol) : "";
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("1M");
  const [spark, setSpark] = useState<number[]>([]);
  const [card, setCard] = useState<TokenCard | null>(null);

  useEffect(() => {
    if (!symbol) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [symbol, onClose]);

  useEffect(() => {
    setPeriod("1M");
    setSpark([]);
    setCard(null);
  }, [symbol]);

  useEffect(() => {
    if (!symbol) return;
    let stop = false;
    let tries = 0;
    async function load() {
      try {
        const r = await fetch(`${API_ORIGIN}/v1/tokens/${encodeURIComponent(symbol)}`);
        const j = (await r.json()) as TokenCard;
        if (stop) return;
        setCard(j);
        if (j.filling && !j.about && tries < 8) {
          tries += 1;
          window.setTimeout(() => {
            if (!stop) void load();
          }, 2000);
        }
      } catch {
        if (!stop) setCard(null);
      }
    }
    void load();
    return () => {
      stop = true;
    };
  }, [symbol]);

  useEffect(() => {
    if (!symbol || !meta.takeId) {
      setSpark([]);
      return;
    }
    const want = symbol.replace(/^RH/, "").toUpperCase();
    fetch(`${API_ORIGIN}/v1/takes/${meta.takeId}/series?range=${period}`)
      .then((r) => r.json())
      .then((j) => {
        const points = (j.points ?? []) as Array<{ holdingContributions?: Array<{ symbol?: string; last?: number | null }> }>;
        const values: number[] = [];
        for (const p of points) {
          const hit = (p.holdingContributions ?? []).find((h) => (h.symbol ?? "").replace(/^RH/, "").toUpperCase() === want);
          if (hit?.last != null) values.push(hit.last);
        }
        setSpark(values);
      })
      .catch(() => setSpark([]));
  }, [symbol, meta.takeId, period]);

  const why = meta.whyInBasket || meta.rationale;

  return (
    <AnimatePresence>
      {symbol ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="stock-title"
            initial={reduce ? false : { y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 24, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            className="glass-sheet relative max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] p-6 pb-8 md:max-w-[440px] md:rounded-[28px] md:p-8"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-mist hover:text-ink"
            >
              <X size={16} />
            </button>
            <p className="text-[13px] font-medium text-muted">Live mark</p>
            <h2 id="stock-title" className="display mt-2 flex items-center gap-2 text-[28px] text-ink">
              {name}
              {meta.role ? <RoleChip role={meta.role} /> : null}
            </h2>
            {card?.name && card.name.toUpperCase() !== name ? (
              <p className="mt-1 text-[15px] text-ink">{card.name}</p>
            ) : null}
            {card?.sector || card?.industry ? (
              <p className="mt-1 text-[13px] text-muted">{[card.sector, card.industry].filter(Boolean).join(" · ")}</p>
            ) : null}
            {meta.weightBps != null ? (
              <p className="mt-1 font-mono text-[13px] text-muted">{(meta.weightBps / 100).toFixed(1)}% of the basket</p>
            ) : null}
            <p className="figure mt-4 text-[28px] text-ink">
              <TickValue value={quote?.last} format={fmtPx} pulse={quote?.seq} color="tick" className="figure text-[28px]" />
            </p>
            <p className="mt-2 font-mono text-[14px]">
              <TickValue value={quote?.chgPct} format={fmtPct} pulse={quote?.seq} color="sign" />
            </p>
            {meta.takeId ? (
              <div className="mt-6">
                <SegmentedTabs options={PERIODS} value={period} onChange={(v) => setPeriod(v as (typeof PERIODS)[number])} layoutId="stock-range" />
                <div className="mt-4">
                  {spark.length > 1 ? (
                    <Spark values={spark} label={`${name} ${period}`} className="h-16 w-full" />
                  ) : (
                    <p className="text-[13px] text-muted">No range yet. Live mark is above.</p>
                  )}
                </div>
              </div>
            ) : null}
            {card?.about ? (
              <div className="mt-6">
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted">What they do</p>
                <p className="mt-2 text-[15px] leading-relaxed text-ink">{card.about}</p>
              </div>
            ) : card?.filling ? (
              <p className="mt-6 text-[13px] text-muted">Looking up what they do…</p>
            ) : null}
            {why ? (
              <div className="mt-6">
                <p className="text-[11px] uppercase tracking-[0.08em] text-muted">Why in the basket</p>
                <p className="mt-2 text-[15px] leading-relaxed text-ink">{why}</p>
              </div>
            ) : null}
            <p className="mt-6 text-[13px] leading-relaxed text-muted">
              Stock tokens offer economic exposure, not share ownership. Marks are live; this is not investment advice.
            </p>
            <Button className="mt-6 w-full" variant="primary" size="lg" onClick={onClose}>
              Done
            </Button>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
