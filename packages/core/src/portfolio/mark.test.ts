import { describe, expect, it } from "vitest";
import { asSharePrice, liveVsSpy } from "./mark.js";

describe("asSharePrice", () => {
  it("maps a 4x token book onto the share print", () => {
    expect(asSharePrice(1056, 264, 1056)).toBeCloseTo(264, 5);
  });

  it("keeps 1:1 names", () => {
    expect(asSharePrice(228.5, 228.6, 228.7)).toBeCloseTo(228.5, 5);
  });

  it("does not let a token print crash the book when the token last is missing", () => {
    expect(asSharePrice(1056, 264, null)).toBeCloseTo(264, 5);
  });
});

describe("liveVsSpy", () => {
  it("ticks with live lasts versus publish and spy", () => {
    const vs = liveVsSpy({
      holdings: [
        { symbol: "NVDA", weightBps: 5000, last: 100, publish: 100 },
        { symbol: "TSLA", weightBps: 5000, last: 100, publish: 100 }
      ],
      quotes: { NVDA: 110, TSLA: 100, SPY: 100 },
      spyPublish: 100
    });
    expect(vs).toBeCloseTo(5, 5);
  });

  it("converts token-denominated publish onto share last", () => {
    const vs = liveVsSpy({
      holdings: [{ symbol: "CRWD", weightBps: 10_000, last: 1056, publish: 1056 }],
      quotes: { CRWD: { last: 264, tokenLast: 1056 }, SPY: { last: 763, tokenLast: 764 } },
      spyPublish: 764
    });
    expect(vs).toBeCloseTo(100 * (264 / 264) - 100 * (763 / 764), 5);
  });

  it("leaves 1:1 names alone", () => {
    const vs = liveVsSpy({
      holdings: [{ symbol: "NVDA", weightBps: 10_000, last: 100, publish: 100 }],
      quotes: { NVDA: { last: 101 } },
      storedBenchmark: 100,
      fallback: 0.2
    });
    expect(vs).toBeCloseTo(1, 5);
  });
});
