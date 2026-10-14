import { describe, expect, it } from "vitest";
import { formatNansenNote } from "./nansen.js";

describe("Nansen note", () => {
  it("formats holders and netflow", () => {
    expect(
      formatNansenNote({
        holders: 1842,
        netflowUsd: -125000,
        smartMoneyNetflowUsd: 10
      })
    ).toBe("Nansen · 1,842 holders · netflow −$125k · smart money in");
  });

  it("skips empty payloads", () => {
    expect(formatNansenNote({})).toBeNull();
    expect(formatNansenNote({ holders: 0, netflowUsd: 0 })).toBeNull();
    expect(formatNansenNote(null)).toBeNull();
  });
});
