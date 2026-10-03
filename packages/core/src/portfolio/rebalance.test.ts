import { describe, expect, it } from "vitest";
import { planRebalanceTrades } from "./rebalance.js";

describe("planRebalanceTrades", () => {
  it("sells overweight names then buys underweight ones", () => {
    const trades = planRebalanceTrades(
      10_000,
      [
        { tokenId: "nvda", usd: 6000 },
        { tokenId: "aapl", usd: 3000 }
      ],
      [
        { tokenId: "nvda", weightBps: 4000 },
        { tokenId: "aapl", weightBps: 4000 }
      ],
      5
    );
    expect(trades.map((t) => t.side)).toEqual(["SELL", "BUY"]);
    expect(trades[0]).toMatchObject({ tokenId: "nvda", side: "SELL" });
    expect(trades[0]!.usd).toBeCloseTo(2000, 5);
    expect(trades[1]).toMatchObject({ tokenId: "aapl", side: "BUY" });
    expect(trades[1]!.usd).toBeCloseTo(1000, 5);
  });

  it("skips dust", () => {
    const trades = planRebalanceTrades(
      10_000,
      [{ tokenId: "nvda", usd: 5002 }],
      [{ tokenId: "nvda", weightBps: 5000 }],
      5
    );
    expect(trades).toEqual([]);
  });
});
