import { describe, expect, it } from "vitest";
import {
  DEFAULT_RH_RPCS,
  isUsableHttpRpc,
  markRpcFailed,
  mergeRhRpcUrls,
  orderedRpcUrls,
  parseChainlistRpcs,
  splitRpcUrls
} from "./rpc-pool.js";

describe("rpc pool", () => {
  it("drops keyed, ws, and junk urls", () => {
    expect(isUsableHttpRpc("https://rpc.mainnet.chain.robinhood.com")).toBe(true);
    expect(isUsableHttpRpc("wss://rpc.mainnet.chain.robinhood.com")).toBe(false);
    expect(isUsableHttpRpc("https://eth.example.com/${API_KEY}")).toBe(false);
    expect(splitRpcUrls("https://a.example, wss://b.example, https://c.example/${KEY}")).toEqual(["https://a.example"]);
  });

  it("reads chainlist rows for Robinhood Chain 4663", () => {
    const urls = parseChainlistRpcs(
      [
        { chainId: 1, rpc: ["https://cloudflare-eth.com"] },
        {
          chainId: 4663,
          name: "Robinhood Chain",
          rpc: [
            { url: "https://rpc.mainnet.chain.robinhood.com", tracking: "none" },
            { url: "wss://feed.mainnet.chain.robinhood.com" },
            { url: "https://vendor.example/${API_KEY}" }
          ]
        }
      ],
      4663
    );
    expect(urls).toEqual(["https://rpc.mainnet.chain.robinhood.com"]);
  });

  it("merges preferred, extras, and official defaults without dupes", () => {
    const urls = mergeRhRpcUrls("https://alchemy.example/rh", ["https://triport.io/rpc/robinhood/public"]);
    expect(urls[0]).toBe("https://alchemy.example/rh");
    expect(urls).toContain(DEFAULT_RH_RPCS[0]);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it("rotates live urls and parks a cooled-down endpoint last", () => {
    const a = "https://a.example";
    const b = "https://b.example";
    markRpcFailed(a, 429);
    const ordered = orderedRpcUrls([a, b], Date.now());
    expect(ordered[0]).toBe(b);
    expect(ordered.at(-1)).toBe(a);
  });
});
