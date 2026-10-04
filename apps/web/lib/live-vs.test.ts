import { describe, expect, it } from "vitest";
import { liveBook } from "./live-book";

describe("liveBook", () => {
  it("marks a fresh $500 fill with today's tape, not a fake 0 vs S&P", () => {
    const book = liveBook(
      [{ symbol: "AAPL", weightBps: 10_000, last: 100, publish: 100 }],
      {
        AAPL: { last: 100, chgPct: 0.02 },
        SPY: { last: 500, chgPct: 0.005 }
      },
      500
    );
    expect(book.sincePct).toBeCloseTo(0);
    expect(book.todayPct).toBeCloseTo(0.02);
    expect(book.displayPct).toBeCloseTo(0.02);
    expect(book.pnlUsd).toBeCloseTo(10);
    expect(book.valueUsd).toBeCloseTo(510);
    expect(book.vsSpy).toBeCloseTo(1.5);
    expect(book.sinceInvested).toBe(false);
    expect(book.legs[0]?.pnlUsd).toBeCloseTo(10);
  });

  it("uses since-invest once the mark leaves the fill", () => {
    const book = liveBook(
      [{ symbol: "AAPL", weightBps: 10_000, last: 100, publish: 100 }],
      {
        AAPL: { last: 97, chgPct: -0.01 },
        SPY: { last: 500, chgPct: 0.01 }
      },
      500
    );
    expect(book.sincePct).toBeCloseTo(-0.03);
    expect(book.displayPct).toBeCloseTo(-0.03);
    expect(book.pnlUsd).toBeCloseTo(-15);
    expect(book.sinceInvested).toBe(true);
    expect(book.vsSpy).toBeCloseTo(-2);
  });

  it("weights two names into one stake", () => {
    const book = liveBook(
      [
        { symbol: "AAPL", weightBps: 6000, last: 100, publish: 100 },
        { symbol: "MSFT", weightBps: 4000, last: 50, publish: 50 }
      ],
      {
        AAPL: { last: 100, chgPct: 0.02 },
        MSFT: { last: 50, chgPct: -0.01 },
        SPY: { last: 500, chgPct: 0 }
      },
      500
    );
    expect(book.todayPct).toBeCloseTo(0.008);
    expect(book.pnlUsd).toBeCloseTo(4);
    expect(book.legs[0]?.pnlUsd).toBeCloseTo(6);
    expect(book.legs[1]?.pnlUsd).toBeCloseTo(-2);
  });
});
