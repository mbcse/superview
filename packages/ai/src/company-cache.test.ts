import { describe, expect, it } from "vitest";
import {
  isFresh,
  parallelIdFromCompany,
  pruneThesis,
  readCache,
  thesisKey,
  thesisNoteFromCompany,
  FACTS_TTL_MS,
  THESIS_TTL_MS
} from "./company-cache.js";
import { chunk } from "./pool.js";
import { catalogCard } from "./screen.js";
import { mergePicks, parseCheckpoint } from "./checkpoint.js";
import { isRetryableError, isRetryableStatus, ParallelCreditsError, ParallelTransientError, retryDelayMs, isCreditsError } from "./parallel-retry.js";

describe("company cache", () => {
  it("keys the same thesis the same way", () => {
    expect(thesisKey("  Diseases will rise  ")).toBe(thesisKey("diseases will rise"));
    expect(thesisKey("a")).not.toBe(thesisKey("b"));
  });

  it("treats week-old facts as stale", () => {
    expect(isFresh(Date.now() - 60_000, FACTS_TTL_MS)).toBe(true);
    expect(isFresh(Date.now() - 8 * 24 * 60 * 60 * 1000, FACTS_TTL_MS)).toBe(false);
    expect(isFresh(Date.now() - 40 * 60 * 60 * 1000, THESIS_TTL_MS)).toBe(false);
  });

  it("keeps the newest thesis notes", () => {
    const thesis = Object.fromEntries(
      Array.from({ length: 10 }, (_, i) => [String(i), { at: new Date(i * 1000).toISOString(), text: "t" }])
    );
    const pruned = pruneThesis(thesis, 8);
    expect(Object.keys(pruned)).toHaveLength(8);
    expect(pruned["0"]).toBeUndefined();
    expect(pruned["9"]).toBeDefined();
  });

  it("reads nested _cache without dropping profile fields", () => {
    const { rest, cache } = readCache({
      description: "drug maker",
      _cache: { factsText: "PFE makes vaccines", factsAt: "2026-09-01T00:00:00.000Z" }
    });
    expect(rest.description).toBe("drug maker");
    expect(cache.factsText).toContain("PFE");
  });

  it("returns a live Parallel run id so we poll instead of starting over", () => {
    const profile = { _cache: { thesis: { abcd: { at: new Date().toISOString(), parallelId: "run_1" } } } };
    expect(parallelIdFromCompany(profile, "abcd")).toBe("run_1");
    expect(thesisNoteFromCompany(profile, "abcd")).toBeNull();
  });
});

describe("checkpoint", () => {
  it("merges screen picks without duplicating symbols", () => {
    const merged = mergePicks(
      [{ symbol: "PFE", angle: "drugs", ring: "direct", reason: "a" }],
      [{ symbol: "pfe", angle: "drugs", ring: "direct", reason: "b" }, { symbol: "UNH", angle: "payors", ring: "indirect", reason: "c" }]
    );
    expect(merged.map((p) => p.symbol.toUpperCase()).sort()).toEqual(["PFE", "UNH"]);
  });

  it("reads an empty checkpoint from missing modelVersions", () => {
    expect(parseCheckpoint(null).picks).toBeUndefined();
    expect(parseCheckpoint({ view: "x", checkpoint: { screenedSymbols: ["PFE"] } }).screenedSymbols).toEqual(["PFE"]);
  });
});

describe("parallel retry", () => {
  it("retries rate limits and overloads, not empty credits", () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(402, "insufficient credits")).toBe(false);
    expect(isRetryableStatus(400, "bad json")).toBe(false);
    expect(isRetryableError(new ParallelTransientError("HTTP 429", { status: 429 }))).toBe(true);
    expect(isRetryableError(new Error("Parallel Task timed out"))).toBe(true);
    expect(isRetryableError(new Error("schema mismatch"))).toBe(false);
    expect(isRetryableError(new ParallelCreditsError("HTTP 402 insufficient credit"))).toBe(false);
    expect(isCreditsError(new Error('HTTP 402 {"message":"Insufficient credit in account, please check your plan and billing details."}'))).toBe(true);
    expect(retryDelayMs(0, 429)).toBeGreaterThanOrEqual(8_000);
  });
});

describe("screen helpers", () => {
  it("chunks the full catalog", () => {
    expect(chunk(Array.from({ length: 195 }, (_, i) => i), 25)).toHaveLength(8);
  });

  it("drops empty summary so the prompt stays small", () => {
    const card = catalogCard({
      symbol: "PFE",
      legalName: "Pfizer",
      businessSummary: "",
      sector: "Health Care",
      tags: ["pharma"],
      embedding: []
    });
    expect(card.what).toBeUndefined();
    expect(card.sector).toBe("Health Care");
  });
});
