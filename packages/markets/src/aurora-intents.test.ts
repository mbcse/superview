import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { AUSD_MONAD_ADDRESS } from "@takeandstake/shared";
import { parseAuroraStatus, parseAuroraTokens, resolveMonadCashRoute } from "./aurora-intents.js";

const fixtures = JSON.parse(
  readFileSync(new URL("../fixtures/aurora-tokens.json", import.meta.url), "utf8")
) as Record<string, unknown>;

describe("Aurora Monad cash resolver", () => {
  it("prefers Monad AUSD when the list has it", () => {
    const route = resolveMonadCashRoute(parseAuroraTokens(fixtures.ausd));
    expect(route?.destIsAusd).toBe(true);
    expect(route?.origin.blockchain).toBe("base");
    expect(route?.origin.symbol).toBe("USDC");
    expect(route?.dest.contractAddress?.toLowerCase()).toBe(AUSD_MONAD_ADDRESS.toLowerCase());
  });

  it("falls back to Monad USDC when AUSD is missing", () => {
    const route = resolveMonadCashRoute(parseAuroraTokens(fixtures.usdcOnly));
    expect(route?.destIsAusd).toBe(false);
    expect(route?.dest.symbol).toBe("USDC");
    expect(route?.dest.blockchain).toBe("monad");
  });

  it("skips when neither Monad cash token is listed", () => {
    expect(resolveMonadCashRoute(parseAuroraTokens(fixtures.neither))).toBeNull();
    expect(parseAuroraTokens({ data: [] })).toEqual([]);
  });
});

describe("Aurora status parse", () => {
  it("reads terminal and in-flight statuses", () => {
    expect(parseAuroraStatus({ status: "SUCCESS" })).toBe("SUCCESS");
    expect(parseAuroraStatus({ status: "PENDING_DEPOSIT" })).toBe("PENDING_DEPOSIT");
    expect(parseAuroraStatus({ status: "bogus" })).toBeNull();
  });
});
