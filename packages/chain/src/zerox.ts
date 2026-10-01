import { ZEROX_PRICE_URL, ZEROX_SWAP_URL } from "./constants.js";

export type ZeroXQuote = {
  buyAmount: string;
  sellAmount: string;
  minBuyAmount?: string;
  transaction?: { to: string; data: string; value: string; gas: string };
  issues?: { allowance?: { spender: string } };
  liquidityAvailable?: boolean;
};

export async function fetchZeroXQuote(opts: {
  apiKey: string;
  chainId: number;
  sellToken: string;
  buyToken: string;
  sellAmount: string;
  taker?: string;
  slippageBps?: number;
  firm: boolean;
}): Promise<ZeroXQuote> {
  const url = new URL(opts.firm ? ZEROX_SWAP_URL : ZEROX_PRICE_URL);
  url.searchParams.set("chainId", String(opts.chainId));
  url.searchParams.set("sellToken", opts.sellToken);
  url.searchParams.set("buyToken", opts.buyToken);
  url.searchParams.set("sellAmount", opts.sellAmount);
  url.searchParams.set("slippageBps", String(opts.slippageBps ?? 100));
  if (opts.taker) url.searchParams.set("taker", opts.taker);

  const res = await fetch(url, {
    headers: {
      "0x-api-key": opts.apiKey,
      "0x-version": "v2"
    }
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`0x quote failed ${res.status}: ${body}`);
  }
  return (await res.json()) as ZeroXQuote;
}

export function quoteUsdPerToken(quote: ZeroXQuote, sellDecimals: number, buyDecimals: number): number {
  const sell = Number(quote.sellAmount) / 10 ** sellDecimals;
  const buy = Number(quote.buyAmount) / 10 ** buyDecimals;
  if (buy === 0) return 0;
  return sell / buy;
}
