import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { verifySharedSecret, verifySvixSignature } from "./webhook-auth.js";

describe("webhook auth", () => {
  it("rejects missing secrets", () => {
    assert.equal(verifySharedSecret("token", ""), false);
    assert.equal(verifySharedSecret("", "token"), false);
    assert.equal(
      verifySvixSignature({ secret: "", id: "1", timestamp: "1", signatureHeader: "v1,x", body: "{}" }),
      false
    );
  });

  it("accepts a matching Svix signature and rejects a forged or stale one", () => {
    const key = Buffer.from("super-secret");
    const secret = `whsec_${key.toString("base64")}`;
    const body = "{\"type\":\"user.created\"}";
    const timestamp = "1700000000";
    const expected = createHmac("sha256", key).update(`msg_1.${timestamp}.${body}`).digest("base64");
    assert.equal(
      verifySvixSignature({
        secret,
        id: "msg_1",
        timestamp,
        signatureHeader: `v1,${expected}`,
        body,
        nowSec: 1_700_000_010
      }),
      true
    );
    assert.equal(
      verifySvixSignature({
        secret,
        id: "msg_1",
        timestamp,
        signatureHeader: "v1,forged",
        body,
        nowSec: 1_700_000_010
      }),
      false
    );
    assert.equal(
      verifySvixSignature({
        secret,
        id: "msg_1",
        timestamp,
        signatureHeader: `v1,${expected}`,
        body,
        nowSec: 1_700_000_400
      }),
      false
    );
  });
});
