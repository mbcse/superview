"use client";

import { motion, useReducedMotion } from "motion/react";
import { fmtPx, fmtPct, fmtUsdDelta } from "@/lib/fmt";
import { TokenMark, stockTick } from "@/components/data/token-mark";
import { cn } from "@/lib/cn";
import { RoleChip } from "@/components/social/role-chip";
import { useLiveQuote } from "@/components/social/price-stream";
import { useStockSheet, type StockMeta } from "@/components/social/stock-sheet";
import { TickValue } from "./tick-value";

function ageLabel(launchedAt: string | Date) {
  const t = typeof launchedAt === "string" ? new Date(launchedAt).getTime() : launchedAt.getTime();
  if (!Number.isFinite(t)) return null;
  const h = Math.max(0, Math.round((Date.now() - t) / 3_600_000));
  if (h < 24) return `${h}h old`;
  return `${Math.round(h / 24)}d old`;
}

export function HoldingRow({
  symbol,
  tokenId,
  weightBps,
  last,
  chgPct,
  pnlUsd,
  rationale,
  role,
  logoUrl,
  confidence,
  takeId,
  whyInBasket,
  venue,
  liquidityUsd,
  launchedAt,
  noExit,
  chainId
}: {
  symbol: string;
  tokenId?: string;
  weightBps: number;
  last?: number | null;
  chgPct?: number | null;
  pnlUsd?: number | null;
  rationale?: string;
  role?: string;
  logoUrl?: string | null;
  confidence?: number | null;
  takeId?: string;
  whyInBasket?: string;
  venue?: string | null;
  liquidityUsd?: number | null;
  launchedAt?: string | Date | null;
  noExit?: boolean;
  chainId?: number;
}) {
  const reduce = useReducedMotion();
  const live = useLiveQuote(symbol, tokenId);
  const { openStock } = useStockSheet();
  const meta: StockMeta = { takeId, rationale, role, weightBps, whyInBasket: whyInBasket ?? rationale, chainId };
  const mark = live?.last ?? last;
  const move = live?.chgPct ?? chgPct;
  const name = stockTick(symbol, chainId);
  const pct = weightBps / 100;

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => openStock(symbol, meta)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openStock(symbol, meta);
        }
      }}
      className={cn(
        "grid cursor-pointer grid-cols-[auto_1fr_auto_auto] items-center gap-3 border-b border-teal/10 py-3 last:border-0 md:grid-cols-[auto_1fr_minmax(80px,1fr)_auto_auto]",
        live?.stale ? "opacity-45" : null
      )}
    >
      <TokenMark symbol={symbol} logoUrl={logoUrl} chainId={chainId} size={32} />
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-medium">
          {name}
          {role ? <RoleChip role={role} /> : null}
        </p>
        {rationale ? <p className="truncate text-[13px] text-muted">{rationale}</p> : null}
        {venue || liquidityUsd != null || noExit ? (
          <p className="mt-0.5 truncate text-[11px] text-muted">
            {[
              venue === "PUMP_CURVE" || venue === "BAGS_CURVE" ? "curve" : venue === "PUMPSWAP" || venue === "AMM" ? "graduated" : null,
              liquidityUsd != null ? `liq $${Math.round(liquidityUsd / 1000)}k` : null,
              launchedAt ? ageLabel(launchedAt) : null,
              noExit ? "no exit" : null,
              live?.stale ? "stale" : null
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        ) : null}
      </div>
      <div className="hidden h-1.5 overflow-hidden rounded-full bg-secondary md:block">
        <motion.div
          className="h-full rounded-full bg-teal"
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${Math.min(100, pct)}%` }}
          transition={{ duration: reduce ? 0 : 0.7, ease: [0.16, 1, 0.3, 1] }}
        />
      </div>
      <TickValue
        value={mark}
        format={fmtPx}
        pulse={live?.seq}
        color="tick"
        className="text-right text-[13px] md:text-[14px]"
      />
      <div className="justify-self-end text-right">
        {move !== undefined && move !== null ? (
          <span className="inline-flex min-h-7 items-center">
            <TickValue value={move} format={fmtPct} pulse={live?.seq} color="sign" className="rounded-full px-2.5 text-[13px] font-medium" />
          </span>
        ) : (
          <span className="num text-[14px]">{pct.toFixed(1)}%</span>
        )}
        {pnlUsd != null ? (
          <TickValue
            value={pnlUsd}
            format={fmtUsdDelta}
            pulse={live?.seq}
            color="sign"
            className="mt-0.5 block text-[11px]"
          />
        ) : null}
        {confidence != null ? (
          <p className="mt-0.5 text-right text-[11px] text-muted">{Math.round(confidence * 100)}%</p>
        ) : null}
      </div>
    </div>
  );
}
