import { describe, expect, it } from "vitest";
import { homeCashUsd, isDustLeg, liveIdempotencyParts, liveSpendUsd, sumCashUsd } from "./live-cash.js";

describe("live cash math", () => {
  it("allows a $1 spend", () => {
    expect(liveSpendUsd(1, 5, 10_000)).toBe(1);
    expect(liveSpendUsd(0.5, 5, 10_000)).toBeNull();
    expect(liveSpendUsd(5, 0.8, 10_000)).toBeNull();
  });

  it("skips dust legs", () => {
    expect(isDustLeg(0.2)).toBe(true);
    expect(isDustLeg(1)).toBe(false);
  });

  it("scopes idempotency by chain", () => {
    const a = liveIdempotencyParts("p", 5, "t", 4663);
    const b = liveIdempotencyParts("p", 5, "t", 8453);
    expect(a.at(-1)).toBe("4663");
    expect(b.at(-1)).toBe("8453");
    expect(a.join(":")).not.toBe(b.join(":"));
  });

  it("sums every cash account", () => {
    expect(
      sumCashUsd([
        { kind: "CASH", entries: [{ usdValue: 3 }, { usdValue: -1 }] },
        { kind: "CASH", entries: [{ usdValue: 2 }] },
        { kind: "POSITION", entries: [{ usdValue: 9 }] }
      ])
    ).toBe(4);
  });

  it("counts Base and Solana USDC as home cash", () => {
    expect(
      homeCashUsd([
        { chainId: 8453, symbol: "USDC", usd: 4 },
        { chainId: 101, symbol: "USDC", usd: 1.5 },
        { chainId: 4663, symbol: "USDG", usd: 9 },
        { chainId: 143, symbol: "AUSD", usd: 2 }
      ])
    ).toBe(5.5);
  });
});
