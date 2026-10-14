import { describe, expect, it } from "vitest";
import { skipReason } from "./fmt";

describe("skipReason", () => {
  it("explains live one-stable skips", () => {
    expect(skipReason("dust")).toBe("Below minimum trade size");
    expect(skipReason("no_privy_route")).toBe("No Privy route to that desk cash");
    expect(skipReason("no_aurora_route")).toBe("No Aurora route to Monad AUSD");
    expect(skipReason("desk_closed")).toBe("Desk closed / no live market");
    expect(skipReason("gas_paused")).toBe("Gas sponsorship is paused");
  });
});
