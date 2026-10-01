import { describe, expect, it } from "vitest";
import { changeTone, fmtAgo, fmtPct, fmtUsd } from "./fmt";
import { loginHref, requiresAuth } from "./auth-paths";
import { proposalLine, decisionLabel } from "./agent-copy";

describe("fmt", () => {
  it("shows em dash for missing values", () => {
    expect(fmtPct(null)).toBe("—");
    expect(fmtUsd(undefined)).toBe("—");
  });
  it("pairs signs with percent", () => {
    expect(fmtPct(0.0123)).toBe("+1.23%");
    expect(fmtPct(-0.02)).toBe("−2.00%");
    expect(changeTone(-1)).toBe("down");
  });
  it("formats relative time", () => {
    expect(fmtAgo(new Date(Date.now() - 12_000))).toBe("now");
    expect(fmtAgo(new Date(Date.now() - 3 * 60 * 1000))).toBe("3m");
    expect(fmtAgo(new Date(Date.now() - 5 * 60 * 60 * 1000))).toBe("5h");
    expect(fmtAgo(null)).toBe("");
  });
});

describe("agent copy", () => {
  it("does not invent a rebalance", () => {
    expect(proposalLine({ noChange: true })).toBe("Checked today. No change.");
    expect(decisionLabel("NO_CHANGE")).toBe("Checked today. No change.");
  });
  it("lists real trades", () => {
    expect(proposalLine([{ action: "trim", symbol: "RHTSLA" }])).toBe("Rebalance: trim TSLA.");
  });
});

describe("auth paths", () => {
  it("protects product surfaces", () => {
    expect(requiresAuth("/app")).toBe(true);
    expect(requiresAuth("/app/pockets")).toBe(true);
    expect(requiresAuth("/explore")).toBe(false);
    expect(loginHref("/app/wallet")).toBe("/login?next=%2Fapp%2Fwallet");
  });
});
