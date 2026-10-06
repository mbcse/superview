import { SOL_MINT } from "@takeandstake/shared";
import type { Venue } from "@takeandstake/shared";
import type { PriceSource } from "./types.js";
import { bagsTradeQuote } from "./bags.js";
import { dexScreenerQuotes } from "./dexscreener.js";
import { jupiterPrices } from "./jupiter.js";
import { pumpCurveQuotes } from "./pump.js";
import { quotesDisagree, xstockDeviationBand } from "./tape.js";
import { xstockPrice } from "./xstocks.js";
import type { AssetRef, Quote } from "./types.js";

function isNyWeekend(ms = Date.now()) {
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short" }).format(new Date(ms));
  return day === "Sat" || day === "Sun";
}

export function pickQuote(asset: AssetRef, byProvider: Map<PriceSource, Map<string, Quote>>): Quote | null {
  const mint = asset.contractAddress;
  const venue: Venue = asset.venue ?? "AMM";
  const order: PriceSource[] =
    venue === "BAGS_CURVE"
      ? ["BAGS", "JUPITER", "DEXSCREENER"]
      : venue === "PUMP_CURVE"
        ? ["PUMPFUN", "JUPITER", "DEXSCREENER"]
        : asset.source === "XSTOCKS"
          ? ["JUPITER", "XSTOCKS", "DEXSCREENER"]
          : ["JUPITER", "DEXSCREENER", "PUMPFUN", "BAGS"];
  for (const p of order) {
    const q = byProvider.get(p)?.get(mint) ?? byProvider.get(p)?.get(asset.id);
    if (q) return { ...q, assetId: asset.id };
  }
  return null;
}

export async function quoteSolanaAssets(assets: AssetRef[]): Promise<Map<string, Quote>> {
  const mints = assets.map((a) => a.contractAddress);
  const pumpAssets = assets.filter((a) => a.venue === "PUMP_CURVE");
  const bagsAssets = assets.filter((a) => a.venue === "BAGS_CURVE").slice(0, 8);
  const xstockAssets = assets.filter((a) => a.source === "XSTOCKS");
  const [jup, dex, solUsd] = await Promise.all([
    jupiterPrices([...mints, SOL_MINT]),
    dexScreenerQuotes(mints),
    jupiterPrices([SOL_MINT])
  ]);
  const solPx = solUsd.get(SOL_MINT)?.last ?? jup.get(SOL_MINT)?.last ?? 0;
  const pump = pumpAssets.length && solPx > 0
    ? await pumpCurveQuotes(pumpAssets.map((a) => ({ mint: a.contractAddress })), solPx)
    : new Map<string, Quote>();
  const bags = new Map<string, Quote>();
  for (const a of bagsAssets) {
    const q = await bagsTradeQuote({
      asset: a,
      side: "BUY",
      amountUsd: 10,
      owner: ""
    });
    if (!q) continue;
    const last = Number(q.inAmount) / 1e6 / (Number(q.outAmount) / 10 ** a.decimals);
    if (last > 0) {
      bags.set(a.contractAddress, {
        assetId: a.id,
        last,
        chg: null,
        liquidityUsd: null,
        observedAt: Date.now(),
        provider: "BAGS",
        halt: false
      });
    }
  }
  const xstocks = new Map<string, Quote>();
  const inSession = !isNyWeekend();
  const band = xstockDeviationBand(inSession);
  const needRef = xstockAssets.filter((a) => a.xstocksSymbol && !jup.get(a.contractAddress)).slice(0, 12);
  const refs = await Promise.all(
    needRef.map(async (a) => [a, await xstockPrice(a.xstocksSymbol!)] as const)
  );
  for (const [a, ref] of refs) {
    const j = jup.get(a.contractAddress);
    if (ref && j && quotesDisagree(j.last, ref, band)) {
      xstocks.set(a.contractAddress, {
        assetId: a.id,
        last: ref,
        chg: j.chg,
        liquidityUsd: j.liquidityUsd,
        observedAt: Date.now(),
        provider: "XSTOCKS",
        halt: true
      });
    } else if (ref) {
      xstocks.set(a.contractAddress, {
        assetId: a.id,
        last: ref,
        chg: null,
        liquidityUsd: null,
        observedAt: Date.now(),
        provider: "XSTOCKS",
        halt: false
      });
    }
  }
  const byProvider = new Map<PriceSource, Map<string, Quote>>([
    ["JUPITER", jup],
    ["DEXSCREENER", dex],
    ["PUMPFUN", pump],
    ["BAGS", bags],
    ["XSTOCKS", xstocks]
  ]);
  const out = new Map<string, Quote>();
  for (const a of assets) {
    const q = pickQuote(a, byProvider);
    if (q) out.set(a.id, q);
  }
  return out;
}
