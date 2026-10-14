import { fetchZeroXQuote, quoteUsdPerToken } from "@takeandstake/chain";
import { kuruBuiltTx, kuruFlowQuote } from "@takeandstake/markets";
import { MONAD_CHAIN_ID, type AssetSource, type Venue } from "@takeandstake/shared";

export type DeskEvmQuote = {
  buyAmount: string;
  sellAmount: string;
  implied: number;
  route: "KURU_FLOW" | "ZEROX";
  transaction?: { to: string; data: string; value?: string };
  spender?: string;
  raw: unknown;
};

export async function quoteEvmDesk(opts: {
  chainId: number;
  side: "BUY" | "SELL";
  token: { id: string; symbol: string; contractAddress: string; decimals: number; venue?: string | null; source?: string | null };
  sellAmount: string;
  amountUsd: number;
  owner: string;
  cashAddress: string;
  zeroxKey?: string;
}): Promise<DeskEvmQuote | null> {
  if (opts.chainId === MONAD_CHAIN_ID) {
    const kuru = await kuruFlowQuote({
      asset: {
        id: opts.token.id,
        symbol: opts.token.symbol,
        chainId: opts.chainId,
        contractAddress: opts.token.contractAddress,
        decimals: opts.token.decimals,
        venue: (opts.token.venue ?? undefined) as Venue | undefined,
        source: (opts.token.source ?? undefined) as AssetSource | undefined
      },
      side: opts.side,
      amountUsd: opts.amountUsd,
      owner: opts.owner,
      sellAmount: opts.sellAmount
    });
    if (kuru && Number(kuru.outAmount) > 0) {
      const tx = kuruBuiltTx(kuru.raw);
      const buyDec = opts.side === "BUY" ? opts.token.decimals : 6;
      const sellDec = opts.side === "BUY" ? 6 : opts.token.decimals;
      const implied = quoteUsdPerToken(
        { buyAmount: kuru.outAmount, sellAmount: kuru.inAmount },
        sellDec,
        buyDec
      );
      if (tx) {
        return {
          buyAmount: kuru.outAmount,
          sellAmount: kuru.inAmount,
          implied,
          route: "KURU_FLOW",
          transaction: tx,
          raw: kuru.raw
        };
      }
    }
  }

  if (!opts.zeroxKey) return null;
  try {
    const quote = await fetchZeroXQuote({
      apiKey: opts.zeroxKey,
      chainId: opts.chainId,
      sellToken: opts.side === "BUY" ? opts.cashAddress : opts.token.contractAddress,
      buyToken: opts.side === "BUY" ? opts.token.contractAddress : opts.cashAddress,
      sellAmount: opts.sellAmount,
      taker: opts.owner,
      firm: true
    });
    if (quote.liquidityAvailable === false || !quote.buyAmount || quote.buyAmount === "0") return null;
    const buyDec = opts.side === "BUY" ? opts.token.decimals : 6;
    const sellDec = opts.side === "BUY" ? 6 : opts.token.decimals;
    return {
      buyAmount: quote.buyAmount,
      sellAmount: quote.sellAmount,
      implied: quoteUsdPerToken(quote, sellDec, buyDec),
      route: "ZEROX",
      transaction: quote.transaction,
      spender: quote.issues?.allowance?.spender,
      raw: quote
    };
  } catch {
    return null;
  }
}
