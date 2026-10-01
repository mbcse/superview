import { test } from "node:test";
import assert from "node:assert/strict";
import { portfolioFromRun, withDraftPayload } from "./portfolio-from-run.js";

const names = ["UNH", "PFE", "JNJ", "LLY", "MRK"];

function runOf(actionId: string) {
  return {
    thesis: { normalizedTake: "diseases are going to increase" },
    modelVersions: {},
    candidates: names.map((symbol, i) => ({
      resolvedTokenId: `tok-${symbol}`,
      holdable: true,
      token: { symbol, isTradingHalt: false },
      score: {
        exposure: 0.6,
        confidence: 0.7,
        rationale: symbol,
        whyInBasket: symbol,
        role: i < 3 ? "direct" : "indirect",
        bullPoints: [],
        bearPoints: []
      }
    }))
  };
}

test("does not collapse when candidates share one economic-action id", () => {
  const shared = "econ-action-1";
  const run = runOf(shared);
  const out = portfolioFromRun(run);
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.ok(out.holdings.length >= 5);
});

test("publishes the researched basket from the draft event", () => {
  const run = runOf("econ-action-1");
  const payload = {
    cashBps: 500,
    holdings: names.map((symbol, i) => ({
      tokenId: `tok-${symbol}`,
      symbol,
      actionId: "direct",
      weightBps: 1900,
      role: i < 3 ? "direct" : "indirect",
      score: 0.4
    }))
  };
  const out = portfolioFromRun(withDraftPayload(run, payload));
  assert.equal(out.ok, true);
  if (!out.ok) return;
  assert.equal(out.holdings.length, 5);
  assert.equal(out.holdings[0]?.weightBps, 1900);
});
