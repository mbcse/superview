import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canSocialMutateTake, canViewTake } from "./take-access.js";

const author = "alice";
const stranger = "bob";

describe("take access", () => {
  it("lets the author see draft and private takes", () => {
    assert.equal(canViewTake({ status: "DRAFT", visibility: "PUBLIC", authorId: author }, author), true);
    assert.equal(canViewTake({ status: "PUBLISHED", visibility: "PRIVATE", authorId: author }, author), true);
    assert.equal(canViewTake({ status: "ARCHIVED", visibility: "PUBLIC", authorId: author }, author), true);
  });

  it("hides draft, private, and archived takes from strangers", () => {
    assert.equal(canViewTake({ status: "DRAFT", visibility: "PUBLIC", authorId: author }, stranger), false);
    assert.equal(canViewTake({ status: "PUBLISHED", visibility: "PRIVATE", authorId: author }, stranger), false);
    assert.equal(canViewTake({ status: "ARCHIVED", visibility: "PUBLIC", authorId: author }, stranger), false);
    assert.equal(canViewTake({ status: "DRAFT", visibility: "PUBLIC", authorId: author }, null), false);
  });

  it("lets anyone view published public or unlisted takes", () => {
    assert.equal(canViewTake({ status: "PUBLISHED", visibility: "PUBLIC", authorId: author }, stranger), true);
    assert.equal(canViewTake({ status: "PUBLISHED", visibility: "UNLISTED", authorId: author }, null), true);
  });

  it("requires a published viewable take for social mutations", () => {
    assert.equal(canSocialMutateTake({ status: "PUBLISHED", visibility: "PUBLIC", authorId: author }, stranger), true);
    assert.equal(canSocialMutateTake({ status: "PUBLISHED", visibility: "UNLISTED", authorId: author }, author), true);
    assert.equal(canSocialMutateTake({ status: "DRAFT", visibility: "PUBLIC", authorId: author }, author), false);
    assert.equal(canSocialMutateTake({ status: "PUBLISHED", visibility: "PRIVATE", authorId: author }, stranger), false);
    assert.equal(canSocialMutateTake({ status: "PUBLISHED", visibility: "PUBLIC", authorId: author }, null), false);
  });
});
