import { generateKeyPairSync } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  assertNotRawAuthorizationKey,
  canonicalPrivyPayload,
  privyAuthorizationSignature,
  privyWalletRpcUrl,
  receiptFillStatus,
  verifyPrivyAuthorizationSignature
} from "./privy-sign.js";

const { privateKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const authorizationKey = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const fixture = {
  method: "POST",
  url: privyWalletRpcUrl("wal_test"),
  body: { method: "eth_sendTransaction", params: { to: "0xabc", data: "0x", value: "0x0" } },
  privyAppId: "clxxxx",
  authorizationKey
};

describe("privy authorization signature", () => {
  it("signs a canonical payload and is not the raw key", () => {
    const signature = privyAuthorizationSignature(fixture);
    expect(signature).not.toEqual(authorizationKey);
    expect(signature).not.toMatch(/BEGIN PRIVATE KEY/);
    assertNotRawAuthorizationKey(signature, authorizationKey);
    expect(verifyPrivyAuthorizationSignature(fixture, signature)).toBe(true);
    expect(canonicalPrivyPayload(fixture)).toContain("https://api.privy.io/v1/wallets/wal_test/rpc");
  });

  it("throws if the header is the raw authorization key", () => {
    expect(() => assertNotRawAuthorizationKey(authorizationKey, authorizationKey)).toThrow(/raw_key/);
  });

  it("marks FILLED only after a successful receipt", () => {
    expect(receiptFillStatus(null)).toBe("FAILED");
    expect(receiptFillStatus({ status: "reverted" })).toBe("FAILED");
    expect(receiptFillStatus({ status: "success" })).toBe("FILLED");
  });
});
