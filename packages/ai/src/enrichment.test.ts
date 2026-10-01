import { describe, expect, it } from "vitest";
import { parseNextEarnings } from "./enrichment.js";

describe("parseNextEarnings", () => {
  it("accepts ISO dates", () => {
    expect(parseNextEarnings("2026-10-28")?.toISOString().startsWith("2026-10-28")).toBe(true);
  });

  it("skips quarters and prose the Date constructor cannot parse", () => {
    expect(parseNextEarnings("Q3 2026")).toBeUndefined();
    expect(parseNextEarnings("late October")).toBeUndefined();
  });

  it("skips Invalid Date objects", () => {
    expect(parseNextEarnings(new Date("nope"))).toBeUndefined();
  });
});
