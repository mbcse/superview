"use client";

import { Spark } from "@/components/charts/spark";
import { fmtPx, fmtPct } from "@/lib/fmt";
import { tick } from "@/lib/fmt";
import { useLiveQuote } from "@/components/social/price-stream";
import { TickValue } from "./tick-value";

export function MoverCard({
  symbol,
  last,
  chgPct,
  spark
}: {
  symbol: string;
  last: number | null;
  chgPct: number | null;
  spark?: number[];
}) {
  const name = tick(symbol);
  const q = useLiveQuote(symbol);
  const mark = q?.last ?? last;
  const move = q?.chgPct ?? chgPct;
  return (
    <article className="min-w-[148px] shrink-0 rounded-[16px] bg-white p-3 ring-1 ring-line">
      <p className="text-[13px] font-medium">{name}</p>
      <TickValue
        value={mark}
        format={fmtPx}
        pulse={q?.seq}
        color="tick"
        className="mt-1 text-[16px] font-semibold"
      />
      <div className="mt-2 flex items-end justify-between gap-2">
        <Spark values={spark ?? []} label={`${name} spark`} />
        <TickValue value={move} format={fmtPct} pulse={q?.seq} color="sign" className="text-[13px] font-medium" />
      </div>
    </article>
  );
}
