import { describe, expect, it } from "vitest";
import { looksLikeJsonSchema, repairLlmValue } from "./generate.js";
import { analystBatchSchema, interpreterSchema, portfolioManagerSchema } from "./prompts/schemas.js";

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

  it("wraps a raw analyst array and ignores json-schema echoes", () => {
    const schemaEcho = {
      type: "object",
      properties: {
        items: { type: "array", items: { type: "object", properties: { symbol: { type: "string" } } } }
      }
    };
    expect(looksLikeJsonSchema(schemaEcho)).toBe(true);
    expect(analystBatchSchema.safeParse(repairLlmValue(schemaEcho)).success).toBe(false);

    const wrapped = repairLlmValue([
      {
        symbol: "AMZN",
        exposurePurity: 0.6,
        directness: 0.5,
        quality: 0.7,
        valuationRoom: 0.5,
        riskPenalty: 0.3,
        confidence: 0.5,
        role: "direct",
        whyInBasket: "Fulfillment labor.",
        whatWouldMakeUsSell: "Wages collapse."
      }
    ]);
    const parsed = analystBatchSchema.safeParse(wrapped);
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.items[0]?.symbol).toBe("AMZN");
  });

  it("fills a sky-only interpreter payload into a thesis", () => {
    const repaired = repairLlmValue({
      skyRead: "Mars enters Scorpio on October 7, 2026. Mars is in its own sign.",
      marketPrediction: "Energy and defense names catch a bid.",
      timeLord: "Mars",
      confidenceInInterpretation: 70,
      assumptions: "Ingress holds",
      suggestWorld: "stocks",
      angles: [{ name: "Energy", ring: "core", companyKinds: "oil" }]
    });
    const parsed = interpreterSchema.safeParse(repaired);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.normalizedView).toMatch(/Energy and defense/i);
      expect(parsed.data.interpretation).toBeTruthy();
      expect(parsed.data.mechanism).toBeTruthy();
      expect(parsed.data.confidenceInInterpretation).toBeCloseTo(0.7);
      expect(parsed.data.assumptions).toEqual(["Ingress holds"]);
      expect(parsed.data.suggestWorld).toBe("STOCKS");
      expect(parsed.data.angles[0]?.ring).toBe("indirect");
      expect(parsed.data.skyRead).toMatch(/Scorpio/);
    }
  });
});
