import { describe, expect, it } from "vitest";
import { fill, INTERPRETER_PROMPT } from "../src/prompts/index.js";
import { interpreterSchema } from "../src/prompts/schemas.js";
import golden from "./golden-takes.json" with { type: "json" };

describe("prompt contract", () => {
  it("fills interpreter variables", () => {
    const p = fill(INTERPRETER_PROMPT, { view: "humanoid robots in every home", date: "2026-09-30", marketContext: "" });
    expect(p).toContain("humanoid robots in every home");
    expect(p).toContain("Only refuse if the input is empty");
  });

  it("schema refuses only with flag", () => {
    const parsed = interpreterSchema.parse({
      normalizedView: "Robots will be in homes.",
      interpretation: "Household labor automates.",
      mechanism: "OEM and component demand rises.",
      horizon: "5y",
      confidenceInInterpretation: 0.7,
      assumptions: ["Costs keep falling"],
      falsifiers: ["No consumer deployments by 2030"],
      clarifyingQuestions: [],
      angles: [
        {
          name: "Build the robots",
          ring: "direct",
          rationale: "Humanoid OEMs",
          companyKinds: ["OEMs"],
          searchPhrases: ["humanoid robot company"]
        }
      ],
      refuse: false
    });
    expect(parsed.refuse).toBe(false);
  });

  for (const g of golden as Array<{ id: string; sentence: string; expectRefuse?: boolean }>) {
    it(`golden sentence exists: ${g.id}`, () => {
      expect(g.sentence.length).toBeGreaterThan(3);
      if (g.expectRefuse) expect(/lambo|asdkj|!{3}/i.test(g.sentence) || g.sentence.length < 8).toBe(true);
    });
  }
});
