"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  createChart,
  ColorType,
  AreaSeries,
  LineSeries,
  LineStyle,
  TickMarkType,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp
} from "lightweight-charts";

export type VsPoint = {
  asOf: string | Date;
  indexValue?: number | null;
  benchmarkIndex?: number | null;
  vsSpy?: number | null;
};

function vsOf(p: VsPoint) {
  if (p.vsSpy != null && Number.isFinite(p.vsSpy)) return p.vsSpy;
  if (p.indexValue != null && p.benchmarkIndex != null) return p.indexValue - p.benchmarkIndex;
  return null;
}

function toUtc(asOf: string | Date): UTCTimestamp | null {
  const t = Math.floor(new Date(asOf).getTime() / 1000);
  return Number.isFinite(t) && t > 0 ? (t as UTCTimestamp) : null;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function barsForRange(range?: string) {
  if (range === "1W") return 7 * 24 * 12;
  if (range === "1M") return 30 * 48;
  if (range === "YTD") {
    const start = new Date(new Date().getFullYear(), 0, 1).getTime();
    return Math.max(48, Math.round((Date.now() - start) / (2 * 3600_000)));
  }
  return 24 * 60;
}

function formatTick(time: UTCTimestamp, type: TickMarkType) {
  const d = new Date(time * 1000);
  if (type === TickMarkType.Year) return String(d.getFullYear());
  if (type === TickMarkType.Month) return d.toLocaleString("en-US", { month: "short" });
  if (type === TickMarkType.DayOfMonth) {
    return `${d.getDate()} ${d.toLocaleString("en-US", { month: "short" })}`;
  }
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function asTime(n: number): UTCTimestamp {
  return n as UTCTimestamp;
}

function laterTime(time: UTCTimestamp, min: UTCTimestamp): UTCTimestamp {
  return (time as number) > (min as number) ? time : asTime((min as number) + 1);
}

function zeroLine(from: UTCTimestamp, to: UTCTimestamp) {
  return [
    { time: from, value: 0 },
    { time: laterTime(to, from), value: 0 }
  ];
}

function applyWindow(chart: IChartApi, range: string | undefined, lastIndex: number) {
  const bars = barsForRange(range);
  chart.timeScale().setVisibleLogicalRange({
    from: lastIndex + 1 - bars,
    to: lastIndex + 4
  });
}

export function VsChart({
  points,
  liveVs,
  summary,
  range
}: {
  points: VsPoint[];
  liveVs?: number | null;
  summary?: string;
  range?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const bookRef = useRef<ISeriesApi<"Area"> | null>(null);
  const zeroRef = useRef<ISeriesApi<"Line"> | null>(null);
  const liveRef = useRef(liveVs);
  liveRef.current = liveVs;

  const hist = useMemo(() => {
    const rows: Array<{ time: UTCTimestamp; value: number }> = [];
    for (const p of points) {
      const time = toUtc(p.asOf);
      const value = vsOf(p);
      if (time == null || value == null || Number.isNaN(value)) continue;
      const last = rows[rows.length - 1];
      if (last && time <= last.time) last.value = value;
      else rows.push({ time, value });
    }
    return rows;
  }, [points]);
  const histRef = useRef(hist);
  histRef.current = hist;

  useEffect(() => {
    if (!host.current) return;
    const chart = createChart(host.current, {
      height: 260,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#526A7D",
        fontFamily: "-apple-system, BlinkMacSystemFont, Helvetica Neue, sans-serif",
        attributionLogo: true
      },
      grid: {
        vertLines: { visible: false },
        horzLines: { color: "#D7E8F4" }
      },
      rightPriceScale: { borderVisible: false },
      timeScale: {
        borderVisible: false,
        timeVisible: range === "1D" || range === "1W",
        secondsVisible: false,
        rightOffset: 4,
        shiftVisibleRangeOnNewBar: true,
        minBarSpacing: range === "1D" ? 1.5 : 0.05,
        tickMarkFormatter: (time: UTCTimestamp, type: TickMarkType) => formatTick(time, type)
      },
      crosshair: { vertLine: { color: "#326D9B" }, horzLine: { color: "#326D9B" } }
    });
    const book = chart.addSeries(AreaSeries, {
      lineColor: "#327564",
      topColor: "rgba(50, 117, 100, 0.22)",
      bottomColor: "rgba(50, 117, 100, 0.02)",
      lineWidth: 2,
      title: "vs S&P 500",
      lastValueVisible: true,
      priceLineVisible: false
    });
    const zero = chart.addSeries(LineSeries, {
      color: "#B7C9D6",
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      lastValueVisible: false,
      priceLineVisible: false
    });
    chartRef.current = chart;
    bookRef.current = book;
    zeroRef.current = zero;
    const ro = new ResizeObserver(() => chart.applyOptions({ width: host.current?.clientWidth }));
    ro.observe(host.current);
    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      bookRef.current = null;
      zeroRef.current = null;
    };
  }, [range]);

  useEffect(() => {
    const book = bookRef.current;
    const zero = zeroRef.current;
    const chart = chartRef.current;
    if (!book || !zero || !chart) return;
    if (!hist.length) return;
    book.setData(hist);
    zero.setData(zeroLine(hist[0]!.time, hist[hist.length - 1]!.time));
    applyWindow(chart, range, hist.length - 1);
  }, [hist, range]);

  useEffect(() => {
    function paint() {
      const book = bookRef.current;
      const zero = zeroRef.current;
      const chart = chartRef.current;
      const vs = liveRef.current;
      const rows = histRef.current;
      if (!book || vs == null || Number.isNaN(vs)) return;
      const now = Math.floor(Date.now() / 1000) as UTCTimestamp;
      const last = rows[rows.length - 1];
      const time = last && now < last.time ? last.time : now;
      if (!rows.length) {
        book.setData([{ time, value: vs }]);
        zero?.setData(zeroLine(time, time));
        if (chart) applyWindow(chart, range, 0);
        return;
      }
      book.update({ time, value: vs });
      zero?.update({ time: laterTime(time, rows[0]!.time), value: 0 });
      chart?.timeScale().scrollToRealTime();
    }
    paint();
    const id = window.setInterval(paint, 1000);
    return () => window.clearInterval(id);
  }, [range, hist]);

  if (!hist.length && (liveVs == null || Number.isNaN(liveVs))) {
    return (
      <div className="chart-skel" role="img" aria-label={summary ?? "No mark yet"}>
        <span>No mark yet</span>
      </div>
    );
  }

  const spanSec = hist.length > 1 ? hist[hist.length - 1]!.time - hist[0]!.time : 0;
  const young =
    range && range !== "1D" && spanSec < (range === "1W" ? 2 * 86400 : 5 * 86400)
      ? "This view is still new. Longer ranges fill in as it trades."
      : null;

  return (
    <figure>
      {summary ? <figcaption className="sr-only">{summary}</figcaption> : null}
      <div ref={host} className="h-[260px] w-full" />
      {young ? <p className="mt-2 text-[12px] text-muted">{young}</p> : null}
    </figure>
  );
}
