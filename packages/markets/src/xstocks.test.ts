import { describe, expect, it } from "vitest";
import { mergeXStockNodes, shouldRetireUnseenXStocks, xstockDisplayName } from "./xstocks.js";

describe("xStocks catalog pages", () => {
  it("keeps every Monad mint from a page and does not retire on a partial pull", () => {
    const into = mergeXStockNodes(
      [
        {
          symbol: "NVDAx",
          name: "NVIDIA xStock",
          deployments: [{ network: "Monad", address: "0xc845b2894dbddd03858fd2d643b4ef725fe0849d" }]
        },
        {
          symbol: "TSLAx",
          name: "Tesla xStock",
          deployments: [{ network: "Monad", address: "0x1111111111111111111111111111111111111111" }]
        }
      ],
      "Monad"
    );
    expect(into.size).toBe(2);
    expect(shouldRetireUnseenXStocks(false, into.size)).toBe(false);
    expect(shouldRetireUnseenXStocks(true, 0)).toBe(false);
    expect(shouldRetireUnseenXStocks(true, into.size)).toBe(true);
  });

  it("drops the issuer suffix from names so Monad rows read like the stock", () => {
    expect(xstockDisplayName("NVIDIA xStock", "NVDAx")).toBe("NVIDIA");
    expect(xstockDisplayName("Tesla xStocks", "TSLAx")).toBe("Tesla");
  });
});
