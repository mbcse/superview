import { describe, expect, it } from "vitest";
import { backingPrivacy, publicInvestedUsd } from "./backing.js";

describe("backing privacy", () => {
  const rows = [
    { userId: "a", level: "DRY_RUN", amountUsd: 250, revealAmount: true },
    { userId: "b", level: "DRY_RUN", amountUsd: 10000, revealAmount: false },
    { userId: "c", level: "WATCH", amountUsd: 1, revealAmount: true }
  ];

  it("sums only revealed invested amounts", () => {
    expect(publicInvestedUsd(rows)).toBe(250);
  });

  it("exposes the viewer’s own amount even if hidden", () => {
    const mine = backingPrivacy(rows, "b");
    expect(mine.publicInvestedUsd).toBe(250);
    expect(mine.backers).toBe(2);
    expect(mine.myInvestedUsd).toBe(10000);
    expect(mine.myRevealAmount).toBe(false);
  });
});
