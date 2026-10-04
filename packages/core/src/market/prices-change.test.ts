import { describe, expect, it } from "vitest";
import { dayChangePct, inheritAliasChg, lastCashSessionStart, lookupPx, setPriceAliases } from "./prices.js";

describe("day change", () => {
  it("uses previous close, not a same-print zero", () => {
    expect(dayChangePct(110, 100)).toBeCloseTo(0.1);
    expect(dayChangePct(100, 100)).toBe(0);
    expect(dayChangePct(100, null)).toBeNull();
    expect(dayChangePct(100, 0)).toBeNull();
  });

  it("reads RH and bare tickers from the same book", () => {
    const book = new Map<string, number>();
    setPriceAliases(book, "NVDA", 120);
    expect(lookupPx(book, "RHNVDA")).toBe(120);
    expect(lookupPx(book, "nvda")).toBe(120);
  });

  it("uses Friday as the last cash session on Sunday", () => {
    const sun = Date.parse("2026-10-04T16:00:00.000Z");
    const start = lastCashSessionStart(sun);
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short"
    }).format(start);
    expect(day).toMatch(/Fri/);
    expect(day).toMatch(/2026-10-02/);
  });

  it("copies a real change onto a new alias that printed 0", () => {
    const quotes = inheritAliasChg([
      { symbol: "NVDA", chgPct: 0.012 },
      { symbol: "RHNVDA", chgPct: 0 }
    ]);
    expect(quotes[1]?.chgPct).toBeCloseTo(0.012);
  });
});
