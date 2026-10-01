import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { handleFromPrivyId } from "./auth-handle.js";

describe("privy handle", () => {
  it("builds a short unique handle", () => {
    assert.match(handleFromPrivyId("did:privy:abc123xyz"), /^sv_/);
  });
});
