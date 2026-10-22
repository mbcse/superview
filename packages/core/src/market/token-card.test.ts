import { describe, expect, it } from "vitest";
import { cleanAbout, isJunkAbout, listingChainOrder, pickTokenCardRow, tokenLookupSymbols } from "./token-card.js";

describe("cleanAbout", () => {
  it("keeps a real company brief", () => {
    const about = cleanAbout(
      "Apple Inc. is a global consumer technology company, with major revenue from iPhone, Mac, and Services."
    );
    expect(about).toContain("iPhone");
  });

  it("drops Parallel run leftovers", () => {
    expect(
      cleanAbout(
        '{"run_id":"trun_44187ff7748a4d4785c25bc9147ac17e","processor":"lite","status":"completed"}'
      )
    ).toBeNull();
    expect(isJunkAbout('{"run_id":"trun_abc","interaction_id":"x"} more text here for length')).toBe(true);
  });

  it("looks up NVDA and NVDAx as the same company", () => {
    expect(tokenLookupSymbols("NVDA")).toEqual(expect.arrayContaining(["NVDA", "NVDAx", "NVDAc"]));
    expect(tokenLookupSymbols("NVDAx")).toEqual(expect.arrayContaining(["NVDA", "NVDAx"]));
    expect(listingChainOrder(143)).toBeGreaterThan(listingChainOrder(101));
    expect(
      pickTokenCardRow(
        [
          { symbol: "NVDA", status: "ACTIVE", chainId: 4663, universe: { legalName: "NVIDIA" } },
          { symbol: "NVDAx", status: "ACTIVE", chainId: 143, universe: null }
        ],
        "NVDA"
      )?.symbol
    ).toBe("NVDAx");
  });

  it("drops the SNAP food-stamp news dump", () => {
    expect(
      cleanAbout(
        "SEC Snap Inc CIK 0001564408 Services-Computer Programming\n\nRecent news:\n• No fines against Indiana retailers so far for SNAP violations"
      )
    ).toBeNull();
  });
});
