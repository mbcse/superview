import { describe, expect, it } from "vitest";
import {
  ASTROLOGY_INTERPRETER_PROMPT,
  astrologyCanon,
  astrologyCanonExcerpt,
  fill
} from "../src/prompts/index.js";
import { interpreterSchema } from "../src/prompts/schemas.js";
import { shouldRefuseView } from "../src/view-guard.js";
import { takeSentenceSchema } from "@takeandstake/shared";

const VEDIC_CHART =
  "Saturn transits the 10th. Sade Sati on the mundane labor house. Mars aspects the 6th of employment. Current dasha favors Shani.";
const WESTERN_CHART =
  "Sun ingresses Capricorn. Saturn squares the 10th. Jupiter-Saturn cycle still tight. Mercury is direct.";

describe("astrology canon", () => {
  it("fills vedic interpreter with vedic canon and does not refuse a transit chart", () => {
    const p = fill(ASTROLOGY_INTERPRETER_PROMPT, {
      view: VEDIC_CHART,
      headline: "",
      date: "2026-10-07",
      system: "VEDIC",
      canon: astrologyCanon("VEDIC"),
      desk: "Stocks · Solana",
      marketContext: ""
    });
    expect(p).toContain(VEDIC_CHART);
    expect(p).toContain("Vimshottari");
    expect(p).toContain("PRIMARY SYSTEM (VEDIC)");
    expect(p).toContain("Saturn");
    expect(shouldRefuseView(VEDIC_CHART)).toBe(false);
  });

  it("fills western interpreter with western canon and does not refuse an ingress chart", () => {
    const p = fill(ASTROLOGY_INTERPRETER_PROMPT, {
      view: WESTERN_CHART,
      headline: "",
      date: "2026-10-07",
      system: "WESTERN",
      canon: astrologyCanon("WESTERN"),
      desk: "Stocks · Solana",
      marketContext: ""
    });
    expect(p).toContain(WESTERN_CHART);
    expect(p).toContain("Jupiter-Saturn");
    expect(p).toContain("PRIMARY SYSTEM (WESTERN)");
    expect(p).toContain("Uranus");
    expect(shouldRefuseView(WESTERN_CHART)).toBe(false);
  });

  it("excerpt keeps the primary canon and drops the other-system glossary", () => {
    const excerpt = astrologyCanonExcerpt("VEDIC");
    expect(excerpt).toContain("PRIMARY SYSTEM (VEDIC)");
    expect(excerpt).toContain("Vimshottari");
    expect(excerpt).not.toContain("DO NOT CONFUSE SYSTEMS");
  });

  it("accepts sky-read fields on the interpreter schema", () => {
    const parsed = interpreterSchema.parse({
      normalizedView: "Labor stays tight and wages keep pressure on operating costs.",
      interpretation: "Saturn on the 10th weighs on labor.",
      mechanism: "Wage bills stay high for industrials and staffing.",
      horizon: "3y",
      confidenceInInterpretation: 0.6,
      assumptions: ["Employment stays tight"],
      falsifiers: ["Unemployment rises for two years"],
      angles: [
        {
          name: "Labor cost",
          ring: "direct",
          rationale: "Staffing and industrials",
          companyKinds: ["staffing", "industrials"],
          searchPhrases: ["staffing agency"]
        }
      ],
      refuse: false,
      skyRead: "Saturn transits the 10th.",
      marketPrediction: "Defensive labor-cost names.",
      timeLord: "Shani",
      transitFocus: "10th bhava"
    });
    expect(parsed.refuse).toBe(false);
    expect(parsed.skyRead).toContain("Saturn");
  });

  it("requires a chart for SKY takes", () => {
    expect(takeSentenceSchema.safeParse({ lens: "SKY", chart: VEDIC_CHART }).success).toBe(true);
    expect(takeSentenceSchema.safeParse({ lens: "SKY", sentence: "Labor stays tight." }).success).toBe(false);
    expect(takeSentenceSchema.safeParse({ sentence: "Robots will be big." }).success).toBe(true);
  });
});
