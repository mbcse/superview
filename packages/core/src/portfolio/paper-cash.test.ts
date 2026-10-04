import { describe, expect, it } from "vitest";
import { applyFill, assertDoubleEntry } from "./ledger.js";
import { paperFillDeltas, parsePaperUsd, prepareSellFill } from "./paper-book.js";

describe("parsePaperUsd", () => {
  it("accepts a rounded paper amount", () => {
    expect(parsePaperUsd(250)).toBe(250);
    expect(parsePaperUsd(10.129)).toBe(10.13);
  });

  it("rejects empty or oversized amounts", () => {
    expect(parsePaperUsd(0)).toBeNull();
    expect(parsePaperUsd(-5)).toBeNull();
    expect(parsePaperUsd(Number.NaN)).toBeNull();
    expect(parsePaperUsd(1_000_001)).toBeNull();
  });
});

describe("paperFillDeltas", () => {
  it("caps a SELL so cash amount and usdValue stay at $40", () => {
    const sold = prepareSellFill({ requestedUsd: 100, haveUsd: 40, haveQty: 2, implied: 20 });
    expect(sold.usd).toBeCloseTo(40);
    expect(sold.cashAmount).toBe(40_000_000n);
    const deltas = paperFillDeltas({ side: "SELL", ...sold });
    expect(deltas.cashDelta).toBe(40_000_000n);
    expect(deltas.usd).toBeCloseTo(-40);
    const lines = applyFill({
      cashAccountId: "c",
      positionAccountId: "p",
      cashDelta: deltas.cashDelta,
      tokenDelta: deltas.tokenDelta,
      usd: deltas.usd
    });
    expect(() => assertDoubleEntry(lines)).not.toThrow();
    const cash = lines.find((l) => l.accountId === "c")!;
    expect(cash.amount).toBe(40_000_000n);
    expect(cash.usdValue).toBeCloseTo(40);
  });

  it("keeps BUY cash and usd netting to zero", () => {
    const deltas = paperFillDeltas({
      side: "BUY",
      cashAmount: 1_000_000n,
      tokenAmount: 2n,
      usd: 1
    });
    const lines = applyFill({
      cashAccountId: "c",
      positionAccountId: "p",
      cashDelta: deltas.cashDelta,
      tokenDelta: deltas.tokenDelta,
      usd: deltas.usd
    });
    expect(deltas.cashDelta).toBe(-1_000_000n);
    expect(() => assertDoubleEntry(lines)).not.toThrow();
  });
});
