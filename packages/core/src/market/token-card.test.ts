import { describe, expect, it } from "vitest";
import { cleanAbout, isJunkAbout } from "./token-card.js";

describe("cleanAbout", () => {
  it("keeps a real company brief", () => {
    const about = cleanAbout(
      "Apple Inc. is a global consumer technology company, with major revenue from iPhone, Mac, and Services."
    );
    expect(about).toContain("iPhone");
  });

  it("drops Parallel run leftovers", () => {
    expect(
      cleanAbout(
        '{"run_id":"trun_44187ff7748a4d4785c25bc9147ac17e","processor":"lite","status":"completed"}'
      )
    ).toBeNull();
    expect(isJunkAbout('{"run_id":"trun_abc","interaction_id":"x"} more text here for length')).toBe(true);
  });

  it("drops the SNAP food-stamp news dump", () => {
    expect(
      cleanAbout(
        "SEC Snap Inc CIK 0001564408 Services-Computer Programming\n\nRecent news:\n• No fines against Indiana retailers so far for SNAP violations"
      )
    ).toBeNull();
  });
});
