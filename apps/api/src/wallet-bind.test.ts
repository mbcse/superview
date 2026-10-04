import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { assertWalletAssignable, grantAllows, liveGrantContracts, verifiedWalletId } from "./wallet-bind.js";

describe("wallet bind", () => {
  it("refuses reassignment of another user's wallet row", () => {
    const r = assertWalletAssignable({ userId: "alice", privyWalletId: "wal_a" }, "bob", "wal_a");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "wallet_bound");
  });

  it("refuses a Privy wallet id that does not match the bound row", () => {
    const r = assertWalletAssignable({ userId: "alice", privyWalletId: "wal_a" }, "alice", "wal_b");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.error, "wallet_mismatch");
  });

  it("ignores a client-invented Privy wallet id", () => {
    assert.equal(verifiedWalletId(undefined, "wal_from_client"), undefined);
    assert.equal(verifiedWalletId("wal_server", "wal_from_client"), "wal_server");
  });
});

describe("live grants", () => {
  const usdg = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168";
  it("fails closed on an empty allowlist", () => {
    assert.equal(grantAllows([], usdg), false);
  });

  it("does not accept a client contract outside the server allowlist", () => {
    const contracts = liveGrantContracts(["0x1111111111111111111111111111111111111111"], "", usdg);
    assert.deepEqual(contracts, [usdg.toLowerCase()]);
  });

  it("intersects requested contracts with the env allowlist", () => {
    const extra = "0x0000000000001ff3684f28c67538d4d92c4650cf";
    const contracts = liveGrantContracts([extra, "0x2222222222222222222222222222222222222222"], extra, usdg);
    assert.ok(contracts.includes(usdg.toLowerCase()));
    assert.ok(contracts.includes(extra));
    assert.equal(contracts.includes("0x2222222222222222222222222222222222222222"), false);
  });
});
