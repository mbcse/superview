import { bagsSwapTx, bagsTradeQuote } from "./bags.js";
import { inspectJupiterRoute } from "./inspect.js";
import { jupiterSwapQuote, jupiterSwapTx } from "./jupiter.js";
import { pumpSdkBuyTx } from "./pump-live.js";
import { simulateTransaction } from "./solana-rpc.js";
import { inspectBuiltTx } from "./tx.js";
import type { AssetRef, SwapQuote } from "./types.js";

export type BuiltRoute = {
  quote: SwapQuote;
  tx: string;
  route: string;
};

export async function quoteVenue(asset: AssetRef, usd: number, owner: string, side: "BUY" | "SELL" = "BUY"): Promise<SwapQuote | null> {
  if (side === "SELL") {
    return jupiterSwapQuote({ asset, side: "SELL", amountUsd: usd, owner });
  }
  if (asset.venue === "BAGS_CURVE") {
    const bags = await bagsTradeQuote({ asset, side: "BUY", amountUsd: usd, owner });
    const jup = await jupiterSwapQuote({ asset, side: "BUY", amountUsd: usd, owner });
    if (bags && jup) return jup.priceImpact < bags.priceImpact ? jup : bags;
    return bags ?? jup;
  }
  return jupiterSwapQuote({ asset, side: "BUY", amountUsd: usd, owner });
}

export async function buildVenueTx(quote: SwapQuote, owner: string, venue?: string): Promise<string | null> {
  if (venue === "BAGS_CURVE" || quote.route === "BAGS") return bagsSwapTx(quote, owner);
  return jupiterSwapTx(quote, owner);
}

export async function quoteAndBuild(
  asset: AssetRef,
  usd: number,
  owner: string
): Promise<{ skip: string } | BuiltRoute> {
  if (asset.world === "MEMES" || asset.venue === "PUMP_CURVE" || asset.venue === "BAGS_CURVE") {
    const sell = await quoteVenue(asset, Math.min(usd, 2), owner, "SELL");
    if (!sell) return { skip: "no_exit" };
  }
  const quote = await quoteVenue(asset, usd, owner);
  if (!quote) {
    if (asset.venue === "PUMP_CURVE") {
      const tx = await pumpSdkBuyTx({ mint: asset.contractAddress, owner, amountUsd: usd });
      if (!tx) return { skip: "no_route" };
      const built = inspectBuiltTx(tx, [owner]);
      if (!built.ok) return { skip: built.reason ?? "inspect_tx" };
      const sim = await simulateTransaction(tx);
      if (!sim.ok) return { skip: "simulation" };
      return {
        quote: {
          inMint: "SOL",
          outMint: asset.contractAddress,
          inAmount: String(usd),
          outAmount: "0",
          priceImpact: 0,
          route: "PUMP",
          raw: { sdk: true }
        },
        tx,
        route: "PUMP"
      };
    }
    return { skip: "no_route" };
  }
  if (quote.priceImpact > 0.05) return { skip: "impact" };
  if (quote.route === "JUPITER") {
    const routeOk = inspectJupiterRoute(quote.raw);
    if (!routeOk.ok) return { skip: routeOk.reason ?? "inspect" };
  }
  const tx = await buildVenueTx(quote, owner, asset.venue);
  if (!tx) return { skip: "no_tx" };
  const built = inspectBuiltTx(tx, [owner]);
  if (!built.ok) return { skip: built.reason ?? "inspect_tx" };
  const sim = await simulateTransaction(tx);
  if (!sim.ok) return { skip: "simulation" };
  return { quote, tx, route: quote.route };
}
