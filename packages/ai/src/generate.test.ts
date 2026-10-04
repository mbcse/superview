import { describe, expect, it } from "vitest";
import { repairLlmValue } from "./generate.js";
import { analystBatchSchema, portfolioManagerSchema } from "./prompts/schemas.js";

describe("repairLlmValue", () => {
  it("drops zero-weight holdings so excluded names do not fail the portfolio schema", () => {
    const repaired = repairLlmValue({
      holdings: [
        {
          symbol: "RCAT",
          weightPct: 0,
          role: "direct",
          conviction: 0,
          sizingReason: "Excluded due to lack of relevance"
        },
        {
          symbol: "NVDA",
          weightPct: 12,
          role: "direct",
          conviction: 0.8,
          sizingReason: "Core"
        }
      ],
      cashPct: 5,
      basketThesis: "AI compute.",
      keyRisks: ["multiple compression"],
      rebalancePolicy: "5% drift",
      expectedBehavior: "beats SPX on AI up days"
    });
    const parsed = portfolioManagerSchema.safeParse(repaired);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.holdings.map((h) => h.symbol)).toEqual(["NVDA"]);
    }
  });

  it("fills missing analyst fields so a scored batch still parses", () => {
    const repaired = repairLlmValue({
      items: [
        {
          symbol: "GEV",
          exposurePurity: 0.9,
          directness: 90,
          quality: "0.8",
          valuationRoom: 0.7,
          riskPenalty: 0.6,
          role: "core",
          why: "Grid equipment follows power demand.",
          bullPoints: "Turbines and grid spend",
          bearPoints: ["Cycle risk"]
        }
      ]
    });
    const parsed = analystBatchSchema.safeParse(repaired);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      const gev = parsed.data.items[0];
      expect(gev?.symbol).toBe("GEV");
      expect(gev?.directness).toBeCloseTo(0.9);
      expect(gev?.quality).toBeCloseTo(0.8);
      expect(gev?.role).toBe("indirect");
      expect(gev?.whyInBasket).toMatch(/Grid equipment/);
      expect(gev?.whatWouldMakeUsSell).toBeTruthy();
      expect(gev?.bullPoints).toEqual(["Turbines and grid spend"]);
    }
  });
});
