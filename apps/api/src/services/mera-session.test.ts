import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { meraMessage, readMeraSession, signMeraSession } from "./mera-session.js";

describe("mera session token", () => {
  it("round-trips a signed session", () => {
    const secret = "a".repeat(32);
    const token = signMeraSession("user_1", secret);
    assert.match(token, /^mera\./);
    assert.equal(readMeraSession(token, secret), "user_1");
  });

  it("rejects a tampered session", () => {
    const secret = "a".repeat(32);
    const token = signMeraSession("user_1", secret);
    assert.equal(readMeraSession(`${token}x`, secret), null);
    assert.equal(readMeraSession(token, "b".repeat(32)), null);
  });
});

describe("mera login message", () => {
  it("binds address and nonce in one string", () => {
    const message = meraMessage("ab".repeat(16), "0x1111111111111111111111111111111111111111");
    assert.match(message, /Address: 0x1111111111111111111111111111111111111111/);
    assert.match(message, /Nonce: abab/);
  });
});
