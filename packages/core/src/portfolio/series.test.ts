import { describe, expect, it } from "vitest";
import { bucketMsForRange, buildTakeSeries, dropUnitMixMarks, logicalBarsForRange, rangeSpanMs, windowExcessVsSpy } from "./series.js";

describe("buildTakeSeries", () => {
  it("uses a tighter bucket for 1D than 1M", () => {
    expect(bucketMsForRange("1D")).toBeLessThan(bucketMsForRange("1W"));
    expect(bucketMsForRange("1W")).toBeLessThan(bucketMsForRange("1M"));
  });

  it("drops a book crash that the S&P did not make", () => {
    const rows = [
      { asOf: new Date("2026-10-01T00:00:00Z"), indexValue: 99.8, benchmarkIndex: 99.9 },
      { asOf: new Date("2026-10-01T00:00:15Z"), indexValue: 87.5, benchmarkIndex: 99.85 },
      { asOf: new Date("2026-10-01T00:00:30Z"), indexValue: 99.7, benchmarkIndex: 99.8 }
    ];
    const kept = dropUnitMixMarks(rows);
    expect(kept.map((p) => p.indexValue)).toEqual([99.8, 99.7]);
  });

  it("keeps last print per minute on 1D", () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({
      asOf: new Date(Date.UTC(2026, 9, 1, 14, 0, i * 10)),
      indexValue: 100 + i * 0.01,
      benchmarkIndex: 100
    }));
    const pts = buildTakeSeries(rows, "1D");
    expect(pts).toHaveLength(1);
    expect(pts[0]?.vsSpy).toBeCloseTo(0.04, 5);
    expect(pts[0]?.asOf.toISOString()).toBe("2026-10-01T14:00:40.000Z");
  });

  it("windows 1W and 1M in calendar time, not the same 1D tape", () => {
    expect(logicalBarsForRange("1D")).toBe(1440);
    expect(logicalBarsForRange("1W")).toBe(2016);
    expect(logicalBarsForRange("1M")).toBe(1440);
    expect(rangeSpanMs("1W")).toBeGreaterThan(rangeSpanMs("1D"));
    expect(rangeSpanMs("1M")).toBeGreaterThan(rangeSpanMs("1W"));
  });

  it("ranks 1D vs All from different windows", () => {
    const now = Date.parse("2026-10-01T12:00:00Z");
    const rows = [
      { asOf: new Date(now - 8 * 24 * 60 * 60 * 1000), indexValue: 100, benchmarkIndex: 100 },
      { asOf: new Date(now - 7 * 24 * 60 * 60 * 1000), indexValue: 108, benchmarkIndex: 101 },
      { asOf: new Date(now - 2 * 60 * 60 * 1000), indexValue: 107, benchmarkIndex: 101.5 },
      { asOf: new Date(now), indexValue: 107.2, benchmarkIndex: 101.6 }
    ];
    const all = windowExcessVsSpy(rows, "All", now);
    const oneDay = windowExcessVsSpy(rows, "1D", now);
    expect(all).toBeCloseTo(5.6, 5);
    expect(oneDay).toBeCloseTo(0.1, 5);
    expect(all).not.toEqual(oneDay);
  });
});
