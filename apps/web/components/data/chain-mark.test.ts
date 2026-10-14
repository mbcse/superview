import { describe, expect, it } from "vitest";
import { resolveChainId } from "./chain-mark";

describe("resolveChainId", () => {
  it("trusts an explicit desk id", () => {
    expect(resolveChainId("FLNC", 4663)).toBe(4663);
    expect(resolveChainId("NVDAc", 8453)).toBe(8453);
    expect(resolveChainId("NVDAx", 101)).toBe(101);
  });

  it("does not treat FLNC or BOX as Base / Solana", () => {
    expect(resolveChainId("FLNC")).toBeUndefined();
    expect(resolveChainId("BOX")).toBeUndefined();
    expect(resolveChainId("CEG")).toBeUndefined();
    expect(resolveChainId("SMR")).toBeUndefined();
  });

  it("still reads issuer suffixes and logos", () => {
    expect(resolveChainId("NVDAx")).toBe(101);
    expect(resolveChainId("NVDAc")).toBe(8453);
    expect(resolveChainId("RHNVDA")).toBe(4663);
    expect(resolveChainId("NVDA", null, "https://metadata.coinbase.com/equity_icons/nvda.png")).toBe(8453);
  });
});
