import { describe, expect, it } from "vitest";
import { resolvePublicUrl } from "./index.js";

describe("resolvePublicUrl", () => {
  it("drops https:// with no host and uses the Railway domain", () => {
    expect(resolvePublicUrl("https://", ["backend-production-xxxx.up.railway.app"], "http://localhost:4000")).toBe(
      "https://backend-production-xxxx.up.railway.app"
    );
  });

  it("accepts a host without a scheme", () => {
    expect(resolvePublicUrl("api.example.com", [], "http://localhost:4000")).toBe("https://api.example.com");
  });
});
