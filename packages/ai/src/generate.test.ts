import { describe, expect, it } from "vitest";
import { repairLlmValue } from "./generate.js";
import { portfolioManagerSchema } from "./prompts/schemas.js";

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
});
