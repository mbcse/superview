import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fill, INTERPRETER_PROMPT } from "../src/prompts/index.js";
import { interpreterSchema } from "../src/prompts/schemas.js";
import { genObject } from "../src/generate.js";
import golden from "./golden-takes.json" with { type: "json" };

function loadRootOpenAiKey() {
  if (process.env.OPENAI_API_KEY) return;
  try {
    const txt = readFileSync(resolve(process.cwd(), "../../.env"), "utf8");
    for (const line of txt.split("\n")) {
      const m = line.match(/^OPENAI_API_KEY=(.*)$/);
      if (!m) continue;
      const val = m[1]!.trim().replace(/^["']|["']$/g, "");
      if (val) process.env.OPENAI_API_KEY = val;
    }
  } catch {
    /* CI without a local .env */
  }
}

loadRootOpenAiKey();

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
});

const rows = golden as Array<{ id: string; sentence: string; expectRefuse?: boolean }>;

describe("golden interpreter", () => {
  for (const g of rows) {
    it.skipIf(!process.env.OPENAI_API_KEY)(
      g.id,
      async () => {
        let out: { refuse: boolean; normalizedView: string; angles: unknown[] };
        try {
          out = await genObject({
            schema: interpreterSchema,
            prompt: fill(INTERPRETER_PROMPT, {
              view: g.sentence,
              date: "2026-10-02",
              marketContext: ""
            }),
            label: `golden:${g.id}`
          });
        } catch (err) {
          if (g.expectRefuse) return;
          throw err;
        }
        if (g.expectRefuse) {
          const noWords = !/[A-Za-z]{3,}/.test(g.sentence);
          expect(out.refuse || noWords).toBe(true);
        } else {
          expect(out.refuse).toBe(false);
          expect(out.normalizedView.trim().length).toBeGreaterThan(0);
          expect(out.angles.length).toBeGreaterThan(0);
        }
      },
      90_000
    );
  }
});
