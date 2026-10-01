import { asNum } from "./mark.js";

export type MarkRow = {
  asOf: Date | string;
  indexValue: unknown;
  benchmarkIndex: unknown;
  holdingContributions?: unknown;
};

export type SeriesPoint = {
  asOf: Date;
  indexValue: number;
  benchmarkIndex: number;
  vsSpy: number;
  holdingContributions: unknown;
};

export function bucketMsForRange(range: string) {
  if (range === "1D") return 60_000;
  if (range === "1W") return 5 * 60_000;
  if (range === "1M") return 30 * 60_000;
  if (range === "YTD" || range === "1Y") return 2 * 60 * 60_000;
  return 15 * 60_000;
}

export function dropUnitMixMarks(rows: MarkRow[]): SeriesPoint[] {
  const out: SeriesPoint[] = [];
  for (const r of rows) {
    const indexValue = asNum(r.indexValue);
    const benchmarkIndex = asNum(r.benchmarkIndex);
    if (indexValue == null || benchmarkIndex == null) continue;
    const prev = out[out.length - 1];
    if (prev) {
      const di = indexValue - prev.indexValue;
      const db = benchmarkIndex - prev.benchmarkIndex;
      if (Math.abs(di) > 3 && Math.abs(db) < 0.35) continue;
    }
    const asOf = r.asOf instanceof Date ? r.asOf : new Date(r.asOf);
    if (Number.isNaN(asOf.getTime())) continue;
    out.push({
      asOf,
      indexValue,
      benchmarkIndex,
      vsSpy: indexValue - benchmarkIndex,
      holdingContributions: r.holdingContributions
    });
  }
  return out;
}

export function downsampleSeries(rows: SeriesPoint[], bucketMs: number): SeriesPoint[] {
  if (bucketMs <= 0) return rows;
  const buckets = new Map<number, SeriesPoint>();
  for (const r of rows) {
    const b = Math.floor(r.asOf.getTime() / bucketMs) * bucketMs;
    buckets.set(b, r);
  }
  return [...buckets.entries()].sort((a, b) => a[0] - b[0]).map(([, p]) => p);
}

export function rangeSpanMs(range: string, now = Date.now()) {
  if (range === "1D") return 24 * 60 * 60 * 1000;
  if (range === "1W") return 7 * 24 * 60 * 60 * 1000;
  if (range === "1M") return 30 * 24 * 60 * 60 * 1000;
  if (range === "YTD") return Math.max(60_000, now - new Date(new Date(now).getFullYear(), 0, 1).getTime());
  if (range === "1Y") return 365 * 24 * 60 * 60 * 1000;
  return 24 * 60 * 60 * 1000;
}

export function logicalBarsForRange(range: string, now = Date.now()) {
  return Math.max(2, Math.round(rangeSpanMs(range, now) / bucketMsForRange(range)));
}

export function buildTakeSeries(rows: MarkRow[], range: string) {
  return downsampleSeries(dropUnitMixMarks(rows), bucketMsForRange(range));
}
