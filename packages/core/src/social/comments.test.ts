import { describe, expect, it } from "vitest";
import { isInfraCommentBody, isPromptLeakBody, publicCommentBody, threadComments, visibleComments } from "./comments.js";

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

  it("hides leaked research prompts", () => {
    expect(isPromptLeakBody("Write an investment memo for this basket: thesis, mechanism")).toBe(true);
    expect(
      isPromptLeakBody(
        JSON.stringify({ id: "task_1", prompt: "Write an investment memo for this basket", status: "created" })
      )
    ).toBe(true);
    expect(isPromptLeakBody("Why is NVDA the largest weight?")).toBe(false);
    expect(publicCommentBody("Write an investment memo for this basket: thesis")).toBeNull();
    expect(publicCommentBody("Grid buildout still leads the basket.")).toBe("Grid buildout still leads the basket.");
    expect(
      visibleComments([
        { body: "Hello", status: "VISIBLE" },
        { body: "Write an investment memo\nView: robots\nHoldings: []", status: "VISIBLE" }
      ]).map((r) => r.body)
    ).toEqual(["Hello"]);
    expect(
      threadComments([
        { body: "Hello", status: "VISIBLE", authorType: "USER" },
        { body: "# INVESTMENT MEMO\nToo long for a thread.", status: "VISIBLE", authorType: "AGENT", isPinned: true }
      ]).map((r) => r.body)
    ).toEqual(["Hello"]);
  });
});
