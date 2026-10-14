import { describe, expect, it } from "vitest";
import { serializeFeedTake } from "./tick.js";

describe("serializeFeedTake", () => {
  it("keeps each holding on its own chain", () => {
    const row = serializeFeedTake({
      id: "t1",
      createdAt: new Date("2026-10-01T00:00:00Z"),
      world: "STOCKS",
      chainId: null,
      author: { handle: "maya" },
      revisions: [
        {
          sentence: "Power demand keeps rising.",
          target: {
            holdings: [
              {
                tokenId: "a",
                weightBps: 5000,
                rationale: "direct",
                token: { symbol: "NVDAx", feedAddress: null, chainId: 101 }
              },
              {
                tokenId: "b",
                weightBps: 5000,
                rationale: "direct",
                token: { symbol: "NVDAc", feedAddress: null, chainId: 8453 }
              }
            ]
          }
        }
      ],
      valuations: [],
      backings: [],
      stances: [],
      linksTo: []
    });
    expect(row.holdings.map((h) => h.chainId)).toEqual([101, 8453]);
    expect(row.benchmark).toBe("SPY");
  });
});
