import { describe, expect, it } from "vitest";
import { constructPortfolio, exposureScore } from "./portfolio/optimizer.js";
import { applyFill, assertDoubleEntry, timeWeightedReturn } from "./portfolio/ledger.js";
import { applyGuardrails } from "./agent/guardrails.js";
import { canonicalReceipt, verifyReceipt } from "./takes/receipt.js";
import { classifyRegime, oracleBand, quoteWithinOracle } from "./execution/checks.js";
import { weightedBookIndex } from "./portfolio/mark.js";

describe("optimizer", () => {
  it("weights sum to 10000", () => {
    const result = constructPortfolio(
      Array.from({ length: 8 }).map((_, i) => ({
        tokenId: `t${i}`,
        symbol: `S${i}`,
        actionId: `a${i % 3}`,
        exposure: 0.8,
        confidence: 0.9
      }))
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const sum = result.holdings.reduce((s, h) => s + h.weightBps, 0) + result.cashBps;
    expect(sum).toBe(10_000);
    expect(result.holdings.length).toBeGreaterThanOrEqual(5);
  });

  it("refuses thin universes", () => {
    const result = constructPortfolio([
      { tokenId: "a", symbol: "A", actionId: "x", exposure: 0.5, confidence: 0.5 }
    ]);
    expect(result.ok).toBe(false);
  });

  it("equal-weights a single-sector theme instead of failing min holdings", () => {
    const result = constructPortfolio(
      Array.from({ length: 6 }).map((_, i) => ({
        tokenId: `t${i}`,
        symbol: `S${i}`,
        actionId: "direct",
        sector: "staples",
        exposure: 0.8,
        confidence: 0.8,
        role: "direct" as const
      }))
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.holdings.length).toBeGreaterThanOrEqual(5);
    const sum = result.holdings.reduce((s, h) => s + h.weightBps, 0) + result.cashBps;
    expect(sum).toBe(10_000);
  });

    it("caps a sector at 45%", () => {
      const result = constructPortfolio(
        Array.from({ length: 8 }).map((_, i) => ({
          tokenId: `t${i}`,
          symbol: `S${i}`,
          actionId: `a${i}`,
          sector: i < 4 ? "tech" : "health",
          exposure: 0.9,
          confidence: 0.9,
          role: "direct" as const
        }))
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      const tech = result.holdings.filter((h) => Number(h.symbol.slice(1)) < 4).reduce((s, h) => s + h.weightBps, 0);
      expect(tech).toBeLessThanOrEqual(4_500);
    });
});

describe("ledger", () => {
  it("fill balances", () => {
    const lines = applyFill({
      cashAccountId: "c",
      positionAccountId: "p",
      cashDelta: -1_000_000n,
      tokenDelta: 2n,
      usd: 1
    });
    expect(() => assertDoubleEntry(lines)).not.toThrow();
  });

  it("TWR strips flows", () => {
    const r = timeWeightedReturn([
      { nav: 100, flow: 0 },
      { nav: 110, flow: 0 }
    ]);
    expect(r).toBeCloseTo(0.1);
  });
});

describe("desk paper rules", () => {
  it("caps meme names at 25 percent", () => {
    const r = applyGuardrails(
      {
        cashBps: 500,
        holdings: []
      },
      [{ tokenId: "m1", weightBps: 4000 }],
      {
        maxTurnoverDailyBps: 10_000,
        maxTurnoverWeeklyBps: 10_000,
        allowNewNames: true,
        maxNewNamesPerWeek: 8,
        cashMinBps: 0,
        cashMaxBps: 2000,
        skipTradeUsd: 5
      },
      { world: "MEMES" }
    );
    expect(r.weights.every((w) => w.weightBps <= 2500)).toBe(true);
  });
});

describe("guardrails", () => {
  it("blocks stale prices", () => {
    const r = applyGuardrails(
      { holdings: [] },
      [{ tokenId: "a", weightBps: 9500 }],
      {
        maxTurnoverDailyBps: 1000,
        maxTurnoverWeeklyBps: 2500,
        allowNewNames: true,
        maxNewNamesPerWeek: 2,
        cashMinBps: 0,
        cashMaxBps: 2000,
        skipTradeUsd: 5
      },
      { pricesStale: true }
    );
    expect(r.violations).toContain("prices_stale");
  });

  it("never exceeds daily turnover", () => {
    const r = applyGuardrails(
      {
        cashBps: 500,
        holdings: [
          { tokenId: "a", action: "remove", conviction: 1, reason: "x", evidenceIds: ["e"], tiedToTakeAction: true },
          { tokenId: "b", action: "add", conviction: 1, reason: "x", evidenceIds: ["e"], tiedToTakeAction: true }
        ]
      },
      [{ tokenId: "a", weightBps: 9500 }],
      {
        maxTurnoverDailyBps: 500,
        maxTurnoverWeeklyBps: 2500,
        allowNewNames: true,
        maxNewNamesPerWeek: 2,
        cashMinBps: 0,
        cashMaxBps: 2000,
        skipTradeUsd: 5
      },
      {}
    );
    expect(r.trimmed.join(" ")).toMatch(/turnover|new_names/);
  });
});

describe("receipts", () => {
  it("hashes stably", () => {
    const a = canonicalReceipt({ b: 1, a: 2 });
    const b = canonicalReceipt({ a: 2, b: 1 });
    expect(a.sha256).toBe(b.sha256);
    expect(verifyReceipt({ a: 2, b: 1 }, a.sha256)).toBe(true);
  });
});

describe("mark", () => {
  it("indexes from last over publish", () => {
    const { index } = weightedBookIndex([
      { tokenId: "a", weightBps: 5000, last: 110, publish: 100 },
      { tokenId: "b", weightBps: 5000, last: 90, publish: 100 }
    ]);
    expect(index).toBeCloseTo(100);
  });
  it("omits legs without a feed", () => {
    const { index } = weightedBookIndex([
      { tokenId: "a", weightBps: 5000, last: 110, publish: 100 },
      { tokenId: "b", weightBps: 5000, last: null, publish: null }
    ]);
    expect(index).toBeCloseTo(110);
  });
});

describe("meme constructor", () => {
  it("allows a 3-name meme basket under a 25% name cap", () => {
    const result = constructPortfolio(
      Array.from({ length: 3 }).map((_, i) => ({
        tokenId: `m${i}`,
        symbol: `M${i}`,
        actionId: `meme${i}`,
        exposure: 0.8,
        confidence: 0.8
      })),
      500,
      { world: "MEMES" }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.holdings.length).toBeGreaterThanOrEqual(3);
    expect(Math.max(...result.holdings.map((h) => h.weightBps))).toBeLessThanOrEqual(2500);
  });

  it("equal-weights a thin meme desk instead of failing", () => {
    const result = constructPortfolio(
      [{ tokenId: "m1", symbol: "DOG", actionId: "meme", exposure: 0.8, confidence: 0.8 }],
      500,
      { world: "MEMES" }
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.holdings).toHaveLength(1);
    expect(result.holdings[0]?.weightBps).toBeLessThanOrEqual(2500);
    expect(result.holdings[0]!.weightBps + result.cashBps).toBe(10_000);
  });
});

describe("market", () => {
  it("labels risk-off", () => {
    expect(classifyRegime({ spxVs50d: -0.05, vix: 28, vixChange: 4, breadth: 0.2 })).toBe("RISK_OFF");
  });
  it("rejects far quotes", () => {
    expect(quoteWithinOracle(110, 100, 0.02)).toBe(false);
    expect(quoteWithinOracle(101, 100, 0.02)).toBe(true);
    expect(oracleBand("MEMES")).toBe(0.04);
    expect(oracleBand("STOCKS", "XSTOCKS", true)).toBe(0.015);
  });
});
