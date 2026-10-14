import { describe, expect, it } from "vitest";
import { kuruBuiltTx } from "./kuru-flow.js";

describe("kuruBuiltTx", () => {
  it("reads a nested transaction", () => {
    expect(kuruBuiltTx({ transaction: { to: "0xabc", data: "0xdef", value: "0x0" } })).toEqual({
      to: "0xabc",
      data: "0xdef",
      value: "0x0"
    });
  });

  it("skips a size-only quote", () => {
    expect(kuruBuiltTx({ outAmount: "1", buyAmount: "1" })).toBeNull();
  });
});
