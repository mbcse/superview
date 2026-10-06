import { describe, expect, it } from "vitest";
import { dayChangePct, filterQuotes, inheritAliasChg, isNyWeekend, lastCashSessionStart, lookupPx, quoteHasSymbol, sessionLast, setPriceAliases } from "./prices.js";

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

  it("keeps xStocks last prints off the Robinhood NVDA key", () => {
    const book = new Map<string, number>();
    setPriceAliases(book, "NVDA", 120, "ROBINHOOD");
    setPriceAliases(book, "NVDAx", 118.4, "XSTOCKS");
    expect(lookupPx(book, "NVDAx", "XSTOCKS")).toBe(118.4);
    expect(lookupPx(book, "NVDA", "ROBINHOOD")).toBe(120);
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

  it("does not treat Sunday as a cash session", () => {
    expect(isNyWeekend(Date.parse("2026-10-04T16:00:00.000Z"))).toBe(true);
    expect(isNyWeekend(Date.parse("2026-10-02T16:00:00.000Z"))).toBe(false);
  });

  it("clamps a weekend book that printed outside the day range", () => {
    expect(
      sessionLast({
        mid: 249.7,
        bid: 229.4,
        ask: 270,
        high: 238.98,
        low: 233.11,
        fallback: 235
      })
    ).toBeCloseTo(238.98);
    expect(
      sessionLast({
        mid: 232.97,
        bid: 231.71,
        ask: 234.23,
        high: 237.87,
        low: 231.16
      })
    ).toBeCloseTo(232.97);
  });

  it("copies a real change onto a new alias that printed 0", () => {
    const quotes = inheritAliasChg([
      { symbol: "NVDA", chgPct: 0.012 },
      { symbol: "RHNVDA", chgPct: 0 }
    ]);
    expect(quotes[1]?.chgPct).toBeCloseTo(0.012);
  });

  it("matches xStocks tickers regardless of trailing-x case", () => {
    const quotes = [{ symbol: "AAPLx", tokenId: "tok_aapl" }];
    expect(quoteHasSymbol(quotes, "AAPLX")).toBe(true);
    expect(filterQuotes(quotes, ["AAPLX"])).toHaveLength(1);
    expect(filterQuotes(quotes, ["tok_aapl"])).toHaveLength(1);
  });
});
