import { describe, expect, it } from "vitest";
import { displaySymbol, multiplierToNumber, pctToFraction, qtyFromRaw, rawFromQty } from "@takeandstake/shared";
import { memePassesGates } from "./risk.js";
import { pickQuote } from "./book.js";
import type { Quote } from "./types.js";

describe("displaySymbol", () => {
  it("strips RH only for Robinhood", () => {
    expect(displaySymbol("RHNVDA", "ROBINHOOD")).toBe("NVDA");
    expect(displaySymbol("RHINO", "BAGS")).toBe("RHINO");
    expect(displaySymbol({ symbol: "RHINO", source: "ROBINHOOD" })).toBe("INO");
    expect(displaySymbol({ symbol: "NVDAx", source: "XSTOCKS" })).toBe("NVDAX");
  });
});

describe("decimals and multiplier", () => {
  it("converts raw units with 6 decimals", () => {
    expect(qtyFromRaw(1_500_000, 6)).toBe(1.5);
    expect(rawFromQty(1.5, 6)).toBe(1_500_000n);
  });
  it("applies xStocks wad multiplier", () => {
    expect(multiplierToNumber("1000000000000000000")).toBe(1);
    expect(multiplierToNumber("2000000000000000000")).toBe(2);
    expect(qtyFromRaw(10_000_000, 6, 2)).toBe(20);
  });
});

describe("pctToFraction", () => {
  it("divides Jupiter 0-100 percents", () => {
    expect(pctToFraction(5)).toBe(0.05);
    expect(pctToFraction(0.05)).toBe(0.05);
    expect(pctToFraction(-3.47)).toBeCloseTo(-0.0347);
  });
});

describe("meme gates", () => {
  it("rejects thin and mintable coins", () => {
    const bad = memePassesGates({
      liquidityUsd: 1_000,
      launchedAt: new Date(),
      risk: { mintAuthorityDisabled: false, freezeAuthorityDisabled: true }
    });
    expect(bad.ok).toBe(false);
    expect(bad.reasons).toContain("low_liquidity");
    expect(bad.reasons).toContain("mint_authority");
  });
});

describe("pump curve", () => {
  it("prices from virtual reserves", async () => {
    const { pumpCurvePriceSol } = await import("./pump.js");
    expect(pumpCurvePriceSol(30_000_000_000n, 1_000_000_000_000n)).toBeCloseTo(0.03);
  });
});

describe("instruction inspector", () => {
  it("rejects a System transfer to a stranger", async () => {
    const { inspectSolanaIxs } = await import("./inspect.js");
    const bad = inspectSolanaIxs(
      [{ programId: "11111111111111111111111111111111", accounts: ["me", "stranger"] }],
      ["me"]
    );
    expect(bad.ok).toBe(false);
    const ok = inspectSolanaIxs(
      [{ programId: "ComputeBudget111111111111111111111111111111" }],
      ["me"]
    );
    expect(ok.ok).toBe(true);
  });
});

describe("adapter fixtures", () => {
  it("parses Jupiter price/v3", async () => {
    const { readFileSync } = await import("node:fs");
    const { pctToFraction } = await import("@takeandstake/shared");
    const body = JSON.parse(readFileSync(new URL("../fixtures/jupiter-price.json", import.meta.url), "utf8")) as Record<
      string,
      { usdPrice?: number; priceChange24h?: number }
    >;
    const row = body.So11111111111111111111111111111111111111112;
    expect(row?.usdPrice).toBeGreaterThan(1);
    expect(pctToFraction(row?.priceChange24h)).toBeCloseTo(0.018);
  });
  it("parses DexScreener token payload", async () => {
    const { readFileSync } = await import("node:fs");
    const rows = JSON.parse(readFileSync(new URL("../fixtures/dexscreener-token.json", import.meta.url), "utf8")) as Array<{
      priceUsd?: string;
      baseToken?: { address?: string };
    }>;
    expect(rows[0]?.baseToken?.address).toMatch(/^So1/);
    expect(Number(rows[0]?.priceUsd)).toBeGreaterThan(1);
  });
  it("quotes a pump curve buy", async () => {
    const { pumpBuyQuote } = await import("./pump.js");
    const q = pumpBuyQuote(30_000_000_000n, 1_000_000_000_000n, 1_000_000_000n);
    expect(q.tokensOut).toBeGreaterThan(0n);
    expect(q.priceSol).toBeCloseTo(0.03);
  });
});

describe("token2022 mint parse", () => {
  it("reads transfer fee from TLV", async () => {
    const { token2022RiskFromMint } = await import("./token2022.js");
    const buf = Buffer.alloc(90);
    buf.writeUInt16LE(1, 82);
    buf.writeUInt16LE(4, 84);
    expect(token2022RiskFromMint(buf.toString("base64"))).toContain("transferFee");
  });
});

describe("tape and inspect", () => {
  it("partitions T1/T2/T3 without overlap", async () => {
    const { partitionHotSets } = await import("./tape.js");
    const sets = partitionHotSets({
      pocketAssetIds: ["a", "b"],
      trendingAssetIds: ["b", "c"],
      publishedAssetIds: ["c", "d"],
      xstockIds: ["x"]
    });
    expect(sets.t1).toEqual(["a", "b", "x"]);
    expect(sets.t2).toEqual(["c"]);
    expect(sets.t3).toEqual(["d"]);
  });
  it("flags xStocks deviation", async () => {
    const { quotesDisagree, xstockDeviationBand } = await import("./tape.js");
    expect(xstockDeviationBand(true)).toBe(0.015);
    expect(quotesDisagree(100, 102, 0.015)).toBe(true);
    expect(quotesDisagree(100, 100.5, 0.015)).toBe(false);
  });
  it("parses Bags and xStocks fixtures", async () => {
    const { readFileSync } = await import("node:fs");
    const bags = JSON.parse(readFileSync(new URL("../fixtures/bags-quote.json", import.meta.url), "utf8")) as {
      response: { outAmount: string };
    };
    const xs = JSON.parse(readFileSync(new URL("../fixtures/xstocks-price.json", import.meta.url), "utf8")) as {
      quote: number;
    };
    const swap = JSON.parse(readFileSync(new URL("../fixtures/jupiter-swap.json", import.meta.url), "utf8")) as {
      routePlan: Array<{ swapInfo?: { label?: string } }>;
    };
    expect(Number(bags.response.outAmount)).toBeGreaterThan(0);
    expect(xs.quote).toBeGreaterThan(200);
    const { inspectJupiterRoute } = await import("./inspect.js");
    expect(inspectJupiterRoute(swap).ok).toBe(true);
  });
});

describe("quote precedence", () => {
  it("prefers Bags on a Bags curve", () => {
    const bags = new Map<string, Quote>([
      ["mint", { assetId: "mint", last: 1, chg: 0, liquidityUsd: 1, observedAt: 1, provider: "BAGS", halt: false }]
    ]);
    const jup = new Map<string, Quote>([
      ["mint", { assetId: "mint", last: 2, chg: 0, liquidityUsd: 1, observedAt: 1, provider: "JUPITER", halt: false }]
    ]);
    const q = pickQuote(
      { id: "a1", symbol: "X", chainId: 101, contractAddress: "mint", decimals: 6, venue: "BAGS_CURVE" },
      new Map([
        ["BAGS", bags],
        ["JUPITER", jup]
      ])
    );
    expect(q?.last).toBe(1);
    expect(q?.assetId).toBe("a1");
  });
});
