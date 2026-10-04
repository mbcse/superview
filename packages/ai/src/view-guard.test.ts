import { describe, expect, it } from "vitest";
import { shouldRefuseView } from "./view-guard.js";

describe("shouldRefuseView", () => {
  it("refuses smash and punctuation", () => {
    expect(shouldRefuseView("asdkjfh asdkjfh qqq")).toBe(true);
    expect(shouldRefuseView("!!!!????")).toBe(true);
    expect(shouldRefuseView("   ")).toBe(true);
  });

  it("keeps real views", () => {
    expect(shouldRefuseView("humanoid robots are coming to every home")).toBe(false);
    expect(shouldRefuseView("just buy apple")).toBe(false);
    expect(shouldRefuseView("Energy gets scarce.")).toBe(false);
  });
});
