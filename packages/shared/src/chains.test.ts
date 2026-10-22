import { describe, expect, it } from "vitest";
import {
  BASE_CHAIN_ID,
  MONAD_CHAIN_ID,
  PAPER_USD_TOKEN_ID,
  ROBINHOOD_CHAIN_ID,
  SOLANA_CHAIN_ID,
  cashTokenIdForChain,
  chainLabel,
  chainOf,
  canPrivyBridgeTo,
  executorFor,
  isKnownChainId,
  isSolanaChain,
  liveFlagForChain,
  privyCashAsset,
  privyChainAlias
} from "./chains.js";
import { catalogHitRank, catalogSearch } from "./catalog.js";
import { cashTokenId, deskOf, parseAllowedChains, parseChainId } from "./worlds.js";
import { companyTicker, sameIssuerListing, sameTokenAddress, underlyingTicker } from "./identity.js";
import { SNAPSHOT_PRICE_MAX, SNAPSHOT_VOLUME_MAX, finiteDecimal } from "./money.js";

describe("chain registry", () => {
  it("knows the four venues", () => {
    expect(isKnownChainId(4663)).toBe(true);
    expect(isKnownChainId(101)).toBe(true);
    expect(isKnownChainId(8453)).toBe(true);
    expect(isKnownChainId(143)).toBe(true);
    expect(isKnownChainId(1)).toBe(false);
  });

  it("labels and cash tokens stay per chain", () => {
    expect(chainLabel(SOLANA_CHAIN_ID)).toBe("Solana");
    expect(chainLabel(BASE_CHAIN_ID)).toBe("Base");
    expect(chainLabel(MONAD_CHAIN_ID)).toBe("Monad");
    expect(chainLabel(ROBINHOOD_CHAIN_ID)).toBe("Robinhood Chain");
    expect(cashTokenIdForChain(ROBINHOOD_CHAIN_ID)).toBe("USDG");
    expect(cashTokenIdForChain(SOLANA_CHAIN_ID)).toBe("USDC:101");
    expect(cashTokenIdForChain(BASE_CHAIN_ID)).toBe("USDC:8453");
    expect(cashTokenIdForChain(MONAD_CHAIN_ID)).toBe("AUSD:143");
    expect(cashTokenId("STOCKS", BASE_CHAIN_ID)).toBe("USDC:8453");
    expect(cashTokenId("STOCKS", MONAD_CHAIN_ID)).toBe("AUSD:143");
    expect(PAPER_USD_TOKEN_ID).toBe("USD");
  });

  it("throws on unknown desk and chain", () => {
    expect(() => chainOf(1)).toThrow(/unknown_chain/);
    expect(() => deskOf("STOCKS", 1)).toThrow(/unknown_desk/);
  });

  it("parses known ids and defaults memes to Solana", () => {
    expect(parseChainId(8453)).toBe(BASE_CHAIN_ID);
    expect(parseChainId("143")).toBe(MONAD_CHAIN_ID);
    expect(parseChainId(undefined, "MEMES")).toBe(SOLANA_CHAIN_ID);
    expect(parseChainId(undefined, "STOCKS")).toBe(MONAD_CHAIN_ID);
    expect(parseAllowedChains(undefined, "STOCKS")).toEqual([MONAD_CHAIN_ID]);
    expect(parseAllowedChains([101, 4663, 8453, 143], "STOCKS")).toEqual([MONAD_CHAIN_ID]);
    expect(parseAllowedChains([101], "STOCKS")).toEqual([MONAD_CHAIN_ID]);
  });

  it("maps executors and live flags", () => {
    expect(executorFor(8453)).toBe("base");
    expect(executorFor(143)).toBe("monad");
    expect(isSolanaChain(101)).toBe(true);
    expect(isSolanaChain(8453)).toBe(false);
    expect(liveFlagForChain(8453)).toBe("live_trading_base");
    expect(liveFlagForChain(143)).toBe("live_trading_monad");
    expect(liveFlagForChain(101, "MEMES")).toBe("live_trading_memes");
  });

  it("collapses issuer suffixes to one company ticker", () => {
    expect(underlyingTicker("RHNVDA", "ROBINHOOD")).toBe("NVDA");
    expect(underlyingTicker("NVDAx", "XSTOCKS")).toBe("NVDA");
    expect(underlyingTicker("NVDAc", "COINBASE")).toBe("NVDA");
    expect(underlyingTicker("NVDA", "ROBINHOOD")).toBe("NVDA");
    expect(companyTicker("NVDAc")).toBe("NVDA");
  });

  it("binds a listing only when ticker and contract both agree", () => {
    const nvda = "0xb20000000000000000000078ee7ce2fe4908108c";
    const other = "0x0000000000000000000000000000000000000001";
    expect(
      sameIssuerListing(
        { chainId: BASE_CHAIN_ID, address: nvda, symbol: "NVDAc", source: "COINBASE", isin: "US67066G1040" },
        { chainId: BASE_CHAIN_ID, address: nvda.toUpperCase(), symbol: "NVDA", source: "COINBASE", isin: "US67066G1040" }
      )
    ).toBe(true);
    expect(
      sameIssuerListing(
        { chainId: BASE_CHAIN_ID, address: nvda, symbol: "NVDAc", source: "COINBASE" },
        { chainId: BASE_CHAIN_ID, address: other, symbol: "NVDAc", source: "COINBASE" }
      )
    ).toBe(false);
    expect(
      sameIssuerListing(
        { chainId: SOLANA_CHAIN_ID, address: "So11111111111111111111111111111111111111112", symbol: "NVDAx", source: "XSTOCKS" },
        { chainId: SOLANA_CHAIN_ID, address: "So11111111111111111111111111111111111111112", symbol: "AAPLx", source: "XSTOCKS" }
      )
    ).toBe(false);
    expect(
      sameIssuerListing(
        { chainId: ROBINHOOD_CHAIN_ID, address: nvda, symbol: "RHNVDA", source: "ROBINHOOD", isin: "US67066G1040" },
        { chainId: ROBINHOOD_CHAIN_ID, address: nvda, symbol: "NVDA", source: "ROBINHOOD", isin: "US0000000000" }
      )
    ).toBe(false);
    expect(sameTokenAddress(nvda, nvda.toUpperCase(), BASE_CHAIN_ID)).toBe(true);
  });
});

describe("catalog search", () => {
  it("treats monad stocks as the Monad desk, not a ticker", () => {
    expect(catalogSearch("monad stocks")).toEqual({ chainId: MONAD_CHAIN_ID });
    expect(catalogSearch("token monad")).toEqual({ chainId: MONAD_CHAIN_ID });
    expect(catalogSearch("nvda monad")).toEqual({ chainId: MONAD_CHAIN_ID, text: "nvda" });
    expect(catalogSearch("TSLA")).toEqual({ text: "TSLA" });
  });

  it("ranks the company ticker ahead of a loose name match", () => {
    expect(catalogHitRank({ symbol: "NVDAx", name: "NVIDIA", underlyingTicker: "NVDA" }, "nvda")).toBe(0);
    expect(catalogHitRank({ symbol: "AEHRx", name: "Aehr Test Systems", underlyingTicker: "AEHR" }, "nvda")).toBe(4);
  });
});

describe("snapshot decimals", () => {
  it("drops Dexscreener overflow that would fail Prisma Decimal writes", () => {
    expect(finiteDecimal(230.26, SNAPSHOT_PRICE_MAX)).toBe(230.26);
    expect(finiteDecimal(Number.POSITIVE_INFINITY, SNAPSHOT_PRICE_MAX)).toBeNull();
    expect(finiteDecimal(1e21, SNAPSHOT_PRICE_MAX)).toBeNull();
    expect(finiteDecimal(0, SNAPSHOT_VOLUME_MAX)).toBeNull();
    expect(finiteDecimal(80_000.449, SNAPSHOT_VOLUME_MAX)).toBe(80_000.449);
  });
});

describe("privy cash routes", () => {
  it("names USDC and USDG but not Monad AUSD", () => {
    expect(privyChainAlias(BASE_CHAIN_ID)).toBe("base");
    expect(privyCashAsset(ROBINHOOD_CHAIN_ID)).toBe("usdg");
    expect(canPrivyBridgeTo(SOLANA_CHAIN_ID)).toBe(true);
    expect(canPrivyBridgeTo(MONAD_CHAIN_ID)).toBe(false);
    expect(privyCashAsset(MONAD_CHAIN_ID)).toBeNull();
  });
});
