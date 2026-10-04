import { describe, expect, it } from "vitest";
import { mergeQuote, type LiveQuote } from "./quote-store";

const base: LiveQuote = { symbol: "TEM", last: 82.2, bid: 82.1, ask: 82.3, halt: false, chgPct: 0.001 };

describe("mergeQuote", () => {
  it("marks the first print without a direction", () => {
    const r = mergeQuote(undefined, base);
    expect(r.changed).toBe(true);
    expect(r.quote.dir).toBeNull();
    expect(r.quote.seq).toBe(1);
  });

  it("flashes up when last ticks higher", () => {
    const r = mergeQuote(base, { ...base, last: 82.25 });
    expect(r.changed).toBe(true);
    expect(r.quote.dir).toBe("up");
    expect(r.quote.seq).toBe(1);
  });

  it("ignores an identical book", () => {
    const first = mergeQuote(undefined, base).quote;
    const r = mergeQuote(first, { ...base });
    expect(r.changed).toBe(false);
    expect(r.quote).toBe(first);
  });

  it("does not flash when only the book ticks", () => {
    const first = mergeQuote(undefined, base).quote;
    const r = mergeQuote(first, { ...base, bid: 82.11, ask: 82.29 });
    expect(r.changed).toBe(true);
    expect(r.quote.seq).toBe(first.seq);
    expect(r.quote.dir).toBeNull();
  });

  it("bumps seq when the day move updates", () => {
    const first = mergeQuote(undefined, base).quote;
    const r = mergeQuote(first, { ...base, chgPct: 0.012 });
    expect(r.changed).toBe(true);
    expect(r.quote.seq).toBe((first.seq ?? 0) + 1);
  });
});
