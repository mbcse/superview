import { describe, expect, it } from "vitest";
import { catalogCensus, collapseTokensByCompany, companyKey, companyScreenScore, pickScreenUniverse } from "./company-universe.js";

describe("company universe", () => {
  it("collapses Solana / Base / RH listings into one company", () => {
    const rows = collapseTokensByCompany([
      {
        symbol: "NVDAx",
        source: "XSTOCKS",
        underlyingTicker: "NVDA",
        liquidityUsd: 5_000_000,
        universe: { businessSummary: "" }
      },
      {
        symbol: "NVDAc",
        source: "COINBASE",
        underlyingTicker: "NVDA",
        liquidityUsd: 0,
        universe: { businessSummary: "NVIDIA designs GPUs.", embedding: [0.1, 0.2] }
      },
      {
        symbol: "NVDA",
        source: "ROBINHOOD",
        underlyingTicker: "NVDA",
        liquidityUsd: 200_000,
        universe: { businessSummary: "NVIDIA designs GPUs.", embedding: [0.2, 0.3] }
      },
      {
        symbol: "AAPLx",
        source: "XSTOCKS",
        underlyingTicker: "AAPL",
        liquidityUsd: 1_000_000,
        universe: { businessSummary: "" }
      }
    ]);
    expect(rows.map((r) => companyKey(r)).sort()).toEqual(["AAPL", "NVDA"]);
    expect(rows.find((r) => companyKey(r) === "NVDA")?.symbol).toBe("NVDA");
  });

  it("prefers a write-up and embedding over raw Solana liquidity", () => {
    const sol = {
      symbol: "DYx",
      source: "XSTOCKS" as const,
      underlyingTicker: "DY",
      liquidityUsd: 9_000_000,
      universe: { businessSummary: "" }
    };
    const rh = {
      symbol: "DY",
      source: "ROBINHOOD" as const,
      underlyingTicker: "DY",
      liquidityUsd: 50_000,
      universe: { businessSummary: "Dycom builds telecom infrastructure.", embedding: [1] }
    };
    expect(companyScreenScore(rh)).toBeGreaterThan(companyScreenScore(sol));
    expect(collapseTokensByCompany([sol, rh])[0]?.symbol).toBe("DY");
  });

  it("takes unique companies from every chain before the global fill", () => {
    const universe = [
      { symbol: "NVDAx", ticker: "NVDA" },
      { symbol: "SMR", ticker: "SMR" },
      { symbol: "HOODc", ticker: "HOOD" },
      { symbol: "DY", ticker: "DY" }
    ];
    const listings = new Map<string, Array<{ chainId: number }>>([
      ["NVDA", [{ chainId: 101 }, { chainId: 4663 }, { chainId: 8453 }]],
      ["SMR", [{ chainId: 4663 }]],
      ["HOOD", [{ chainId: 8453 }]],
      ["DY", [{ chainId: 143 }]]
    ]);
    const picked = pickScreenUniverse(universe, listings, [101, 4663, 8453, 143], (rows) => rows, 1, 8);
    expect(picked.rows.map((r) => r.ticker)).toEqual(["NVDA", "SMR", "HOOD", "DY"]);
    expect(picked.addedByChain).toEqual({ 101: 1, 4663: 1, 8453: 1, 143: 1 });
  });

  it("counts listings and unique companies per desk", () => {
    const census = catalogCensus(
      [
        { chainId: 101, symbol: "NVDAx", source: "XSTOCKS", underlyingTicker: "NVDA" },
        { chainId: 4663, symbol: "NVDA", source: "ROBINHOOD", underlyingTicker: "NVDA" },
        { chainId: 8453, symbol: "NVDAc", source: "COINBASE", underlyingTicker: "NVDA" },
        { chainId: 4663, symbol: "SMR", source: "ROBINHOOD", underlyingTicker: "SMR" }
      ],
      [101, 4663, 8453, 143],
      (id) => ({ 101: "Solana", 4663: "Robinhood Chain", 8453: "Base", 143: "Monad" }[id] ?? String(id)),
      { 101: 1, 4663: 1, 8453: 1, 143: 0 }
    );
    expect(census.listings).toBe(4);
    expect(census.companies).toBe(2);
    expect(census.desks.find((d) => d.chainId === 4663)).toMatchObject({ listings: 2, companies: 2, taking: 1 });
    expect(census.desks.find((d) => d.chainId === 143)?.listings).toBe(0);
  });
});
