import { describe, expect, it } from "vitest";
import { sameIssuerListing } from "@takeandstake/shared";
import {
  coinbaseMultiplierWad,
  coinbaseUnderlyingTicker,
  isCoinbaseNavFresh,
  parseCoinbaseToken,
  parseCoinbaseTokenizedStocks,
  pickCoinbaseQuote
} from "./coinbase-base.js";
import { parseXStockNode } from "./xstocks.js";
import type { Quote } from "./types.js";

const NVDA = {
  contract_address: "0xb20000000000000000000078ee7ce2fE4908108C",
  symbol: "NVDAc",
  name: "NVIDIA Corporation",
  decimals: 8,
  icon_url: "https://metadata.coinbase.com/equity_icons/nvda.png",
  isin: "US67066G1040",
  multiplier: 1.0005379395763694,
  nav_price: 230.26390146,
  nav_price_updated_at: "2026-10-09T15:17:53Z",
  redeem_paused: false,
  is_live: true
};

const dex: Quote = {
  assetId: "0xb20000000000000000000078ee7ce2fe4908108c",
  last: 231.1,
  chg: 0.01,
  liquidityUsd: 80_000,
  observedAt: Date.parse("2026-10-11T05:00:00Z"),
  provider: "DEXSCREENER",
  halt: false
};

describe("Coinbase tokenized stocks parser", () => {
  it("keeps official address, suffix, decimals, ISIN, and NAV", () => {
    const now = Date.parse("2026-10-09T16:00:00Z");
    const row = parseCoinbaseToken(NVDA, now);
    expect(row).toMatchObject({
      symbol: "NVDAc",
      address: "0xb20000000000000000000078ee7ce2fe4908108c",
      decimals: 8,
      isin: "US67066G1040",
      navPrice: 230.26390146,
      navFresh: true,
      redeemPaused: false
    });
    expect(coinbaseUnderlyingTicker(row!.symbol)).toBe("NVDA");
    expect(coinbaseMultiplierWad(1)).toBe("1000000000000000000");
    expect(Number(coinbaseMultiplierWad(row!.multiplier)) / 1e18).toBeCloseTo(row!.multiplier);
  });

  it("drops tokens that are not live or have a bad contract", () => {
    expect(parseCoinbaseToken({ ...NVDA, is_live: false })).toBeNull();
    expect(parseCoinbaseToken({ ...NVDA, contract_address: "NVDAx" })).toBeNull();
    expect(parseCoinbaseToken({ ...NVDA, symbol: "" })).toBeNull();
  });

  it("treats NAV as stale after the 26h heartbeat grace", () => {
    const updated = new Date("2026-10-09T15:17:53Z");
    expect(isCoinbaseNavFresh(updated, Date.parse("2026-10-10T16:00:00Z"))).toBe(true);
    expect(isCoinbaseNavFresh(updated, Date.parse("2026-10-11T00:00:00Z"))).toBe(false);
    expect(isCoinbaseNavFresh(null)).toBe(false);
  });

  it("dedupes by lowercase address and skips a non-list payload", () => {
    const rows = parseCoinbaseTokenizedStocks({
      tokens: [NVDA, { ...NVDA, contract_address: NVDA.contract_address.toLowerCase() }, { is_live: true }]
    });
    expect(rows).toHaveLength(1);
    expect(parseCoinbaseTokenizedStocks({ data: [] })).toEqual([]);
  });

  it("strips the Coinbase c suffix including dotted tickers", () => {
    expect(coinbaseUnderlyingTicker("BRK.Bc")).toBe("BRK.B");
    expect(coinbaseUnderlyingTicker("AAPLc")).toBe("AAPL");
  });
});

describe("Coinbase quote pick", () => {
  it("prefers fresh Chainlink NAV and keeps the DEX print as liquidity", () => {
    const q = pickCoinbaseQuote({
      assetId: "nvda",
      navPrice: 230.26,
      navFresh: true,
      navUpdatedAt: new Date("2026-10-09T15:17:53Z"),
      dex
    });
    expect(q?.provider).toBe("CHAINLINK");
    expect(q?.last).toBe(230.26);
    expect(q?.liquidityUsd).toBe(80_000);
    expect(q?.chg).toBe(0.01);
  });

  it("falls back to Dexscreener when NAV is stale and a pool exists", () => {
    const stale = pickCoinbaseQuote({ assetId: "nvda", navPrice: 230.26, navFresh: false, dex });
    expect(stale?.provider).toBe("DEXSCREENER");
    expect(stale?.last).toBe(231.1);
    expect(pickCoinbaseQuote({ assetId: "nvda", navPrice: null, navFresh: false })).toBeNull();
  });

  it("keeps a stale Coinbase NAV when there is no Dexscreener pool", () => {
    const q = pickCoinbaseQuote({ assetId: "smr", navPrice: 41.2, navFresh: false, navUpdatedAt: new Date("2026-10-09T15:17:53Z") });
    expect(q?.provider).toBe("CHAINLINK");
    expect(q?.last).toBe(41.2);
  });

  it("refuses Coinbase NAV when the stored ticker is a different company", () => {
    const row = parseCoinbaseToken(NVDA, Date.parse("2026-10-09T16:00:00Z"));
    expect(row).toBeTruthy();
    expect(
      sameIssuerListing(
        { chainId: 8453, address: row!.address, symbol: "AAPLc", source: "COINBASE" },
        { chainId: 8453, address: row!.address, symbol: row!.symbol, source: "COINBASE", isin: row!.isin }
      )
    ).toBe(false);
  });
});

describe("xStocks listing bind", () => {
  const node = {
    symbol: "NVDAx",
    name: "NVIDIA xStock",
    isin: "CH1412400326",
    underlying: { isin: "US67066G1040" },
    deployments: [
      { network: "Mantle", address: "0x9443176f5224ef669847524b35eb5c1d80ecac3f" },
      { network: "Monad", address: "0xc845b2894dbddd03858fd2d643b4ef725fe0849d" },
      { network: "Solana", address: "XsoCS1TfEyfFhfvj8EtZ538L3NKLFUwPPEbCnTvwre4" }
    ]
  };

  it("takes the network mint and ignores other deployments", () => {
    expect(parseXStockNode(node, "Monad")?.mint).toBe("0xc845b2894dbddd03858fd2d643b4ef725fe0849d");
    expect(parseXStockNode(node, "Solana")?.mint).toBe("XsoCS1TfEyfFhfvj8EtZ538L3NKLFUwPPEbCnTvwre4");
    expect(parseXStockNode(node, "Monad")?.symbol).toBe("NVDAx");
  });

  it("drops a row with no ticker or a mint that is not valid on that chain", () => {
    expect(parseXStockNode({ ...node, symbol: "" }, "Monad")).toBeNull();
    expect(
      parseXStockNode(
        { ...node, deployments: [{ network: "Monad", address: "not-an-address" }] },
        "Monad"
      )
    ).toBeNull();
    expect(
      parseXStockNode({ ...node, deployments: [{ network: "Base", address: "0xc845b2894dbddd03858fd2d643b4ef725fe0849d" }] }, "Monad")
    ).toBeNull();
  });
});
