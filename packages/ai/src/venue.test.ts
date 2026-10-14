import { describe, expect, it } from "vitest";
import { assertOneCompanyOnce, routeBasket, type VenueListing } from "./venue.js";

function L(partial: Partial<VenueListing> & Pick<VenueListing, "tokenId" | "symbol" | "chainId">): VenueListing {
  return {
    source: "XSTOCKS",
    underlyingTicker: "NVDA",
    liquidityUsd: 1_000_000,
    priceAgeMs: 1_000,
    halted: false,
    status: "ACTIVE",
    ...partial
  };
}

describe("venue router", () => {
  it("picks one listing per company on the more liquid book", () => {
    const routed = routeBasket(
      [
        {
          ticker: "NVDA",
          weightBps: 4000,
          listings: [
            L({ tokenId: "sol-nvda", symbol: "NVDAx", chainId: 101, liquidityUsd: 5_000_000 }),
            L({ tokenId: "rh-nvda", symbol: "NVDA", chainId: 4663, source: "ROBINHOOD", liquidityUsd: 200_000 })
          ]
        },
        {
          ticker: "AAPL",
          weightBps: 3000,
          listings: [
            L({
              tokenId: "sol-aapl",
              symbol: "AAPLx",
              chainId: 101,
              underlyingTicker: "AAPL",
              liquidityUsd: 4_000_000
            }),
            L({
              tokenId: "rh-aapl",
              symbol: "AAPL",
              chainId: 4663,
              source: "ROBINHOOD",
              underlyingTicker: "AAPL",
              liquidityUsd: 100_000
            })
          ]
        }
      ],
      { world: "STOCKS", allowedChains: [101, 4663, 8453, 143] }
    );
    expect(routed).toHaveLength(2);
    expect(new Set(routed.map((r) => r.chainId)).size).toBe(1);
    expect(routed.every((r) => r.chainId === 101)).toBe(true);
  });

  it("splits only missing names", () => {
    const routed = routeBasket(
      [
        {
          ticker: "NVDA",
          weightBps: 5000,
          listings: [L({ tokenId: "sol-nvda", symbol: "NVDAx", chainId: 101 })]
        },
        {
          ticker: "SPCX",
          weightBps: 3000,
          listings: [
            L({
              tokenId: "base-spcx",
              symbol: "SPCX",
              chainId: 8453,
              source: "COINBASE",
              underlyingTicker: "SPCX",
              liquidityUsd: 50_000
            })
          ]
        }
      ],
      { world: "STOCKS", allowedChains: [101, 8453] }
    );
    expect(routed.find((r) => r.underlyingTicker === "NVDA")?.chainId).toBe(101);
    expect(routed.find((r) => r.underlyingTicker === "SPCX")?.chainId).toBe(8453);
  });

  it("spreads close books across desks instead of pinning one chain", () => {
    const routed = routeBasket(
      [
        {
          ticker: "NVDA",
          weightBps: 4000,
          listings: [L({ tokenId: "sol-nvda", symbol: "NVDAx", chainId: 101, liquidityUsd: 5_000_000 })]
        },
        {
          ticker: "HOOD",
          weightBps: 2000,
          listings: [
            L({ tokenId: "sol-hood", symbol: "HOODx", chainId: 101, underlyingTicker: "HOOD", liquidityUsd: 0 }),
            L({
              tokenId: "base-hood",
              symbol: "HOODc",
              chainId: 8453,
              source: "COINBASE",
              underlyingTicker: "HOOD",
              liquidityUsd: 0
            }),
            L({
              tokenId: "rh-hood",
              symbol: "HOOD",
              chainId: 4663,
              source: "ROBINHOOD",
              underlyingTicker: "HOOD",
              liquidityUsd: 0
            })
          ]
        },
        {
          ticker: "CEG",
          weightBps: 2000,
          listings: [
            L({ tokenId: "sol-ceg", symbol: "CEGx", chainId: 101, underlyingTicker: "CEG", liquidityUsd: 0 }),
            L({
              tokenId: "rh-ceg",
              symbol: "CEG",
              chainId: 4663,
              source: "ROBINHOOD",
              underlyingTicker: "CEG",
              liquidityUsd: 0
            })
          ]
        }
      ],
      { world: "STOCKS", allowedChains: [101, 4663, 8453, 143] }
    );
    expect(routed.find((r) => r.underlyingTicker === "NVDA")?.chainId).toBe(101);
    expect(new Set(routed.map((r) => r.chainId)).size).toBeGreaterThan(1);
    expect(routed.some((r) => r.chainId === 8453 || r.chainId === 4663)).toBe(true);
  });

  it("respects allowedChains and geo", () => {
    const routed = routeBasket(
      [
        {
          ticker: "NVDA",
          weightBps: 5000,
          listings: [
            L({ tokenId: "sol-nvda", symbol: "NVDAx", chainId: 101 }),
            L({ tokenId: "rh-nvda", symbol: "NVDA", chainId: 4663, source: "ROBINHOOD" })
          ]
        }
      ],
      { world: "STOCKS", allowedChains: [4663], country: "US" }
    );
    expect(routed).toHaveLength(0);
  });

  it("rejects the same company twice", () => {
    expect(() =>
      assertOneCompanyOnce([
        { symbol: "NVDAx", source: "XSTOCKS", underlyingTicker: "NVDA" },
        { symbol: "NVDA", source: "ROBINHOOD", underlyingTicker: "NVDA" }
      ])
    ).toThrow(/duplicate_company:NVDA/);
  });
});
