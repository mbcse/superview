import { describe, expect, it } from "vitest";
import { isInfraCommentBody, visibleComments } from "./comments.js";

describe("infra comments", () => {
  it("hides gRPC unauthenticated JSON", () => {
    expect(
      isInfraCommentBody(
        '{"code":16, "message":"invalid token: token is malformed: token contains an invalid number of segments", "details":[]}'
      )
    ).toBe(true);
  });

  it("keeps ordinary discussion", () => {
    expect(isInfraCommentBody("Why is NVDA the largest weight?")).toBe(false);
    expect(isInfraCommentBody("The agent should check the tokenized NVIDIA weight.")).toBe(false);
  });

  it("drops hidden or infra rows", () => {
    const rows = visibleComments([
      { body: "Hello", status: "VISIBLE" },
      { body: '{"code":16,"message":"invalid token","details":[]}', status: "VISIBLE" },
      { body: "Gone", status: "HIDDEN" }
    ]);
    expect(rows.map((r) => r.body)).toEqual(["Hello"]);
  });
});
