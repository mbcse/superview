import { describe, expect, it } from "vitest";
import { groupHoldingsByChain } from "./live-guard.js";
import { executorFor } from "@takeandstake/shared";

describe("live dispatch", () => {
  it("fails closed on unknown chains", () => {
    expect(() => executorFor(1)).toThrow(/unknown_chain/);
  });

  it("groups holdings by token chain", () => {
    const groups = groupHoldingsByChain([
      { token: { chainId: 101 } },
      { token: { chainId: 8453 } },
      { token: { chainId: 101 } }
    ]);
    expect(groups.get(101)).toHaveLength(2);
    expect(groups.get(8453)).toHaveLength(1);
  });
});
