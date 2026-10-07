import { SOL_MINT } from "@takeandstake/shared";
import { jupiterPrices } from "./jupiter.js";

/** Official Pump SDK buy (SOL in). Returns a base64 unsigned tx or null. */
export async function pumpSdkBuyTx(opts: {
  mint: string;
  owner: string;
  amountUsd: number;
}): Promise<string | null> {
  try {
    const web3 = (await import("@solana/web3.js")) as typeof import("@solana/web3.js");
    const pump = (await import("@pump-fun/pump-sdk")) as unknown as {
      OnlinePumpSdk: new (c: unknown) => {
        fetchGlobal: () => Promise<unknown>;
        fetchFeeConfig: () => Promise<unknown>;
        fetchBuyState: (mint: unknown, user: unknown) => Promise<{
          quoteMint: unknown;
          quoteTokenProgram: unknown;
          bondingCurveAccountInfo: unknown;
          bondingCurve: unknown;
          associatedUserAccountInfo: unknown;
        }>;
      };
      PumpSdk: new () => {
        buyInstructions: (a: Record<string, unknown>) => Promise<unknown[]>;
      };
      getBuyTokenAmountFromSolAmount: (a: Record<string, unknown>) => unknown;
      BN: new (n: string) => unknown;
    };
    const { default: BN } = (await import("bn.js")) as { default: new (n: string) => unknown };
    const solBook = await jupiterPrices([SOL_MINT]);
    const solUsd = solBook.get(SOL_MINT)?.last ?? 0;
    if (!(solUsd > 0) || !(opts.amountUsd > 0)) return null;
    const lamports = BigInt(Math.max(1, Math.round((opts.amountUsd / solUsd) * 1e9)));
    const url = process.env.SOLANA_RPC_URL?.trim() || "https://api.mainnet-beta.solana.com";
    const connection = new web3.Connection(url, "confirmed");
    const online = new pump.OnlinePumpSdk(connection);
    const offline = new pump.PumpSdk();
    const mint = new web3.PublicKey(opts.mint);
    const user = new web3.PublicKey(opts.owner);
    const global = await online.fetchGlobal();
    const feeConfig = await online.fetchFeeConfig().catch(() => null);
    const state = await online.fetchBuyState(mint, user);
    const solAmount = new BN(lamports.toString());
    const amount = pump.getBuyTokenAmountFromSolAmount({
      global,
      feeConfig,
      mintSupply: null,
      bondingCurve: state.bondingCurve,
      amount: solAmount,
      quoteMint: state.quoteMint
    });
    const ixs = await offline.buyInstructions({
      global,
      bondingCurveAccountInfo: state.bondingCurveAccountInfo,
      bondingCurve: state.bondingCurve,
      associatedUserAccountInfo: state.associatedUserAccountInfo,
      mint,
      user,
      amount,
      solAmount,
      slippage: 1,
      tokenProgram: state.quoteTokenProgram
    });
    const tx = new web3.Transaction();
    for (const ix of ixs) tx.add(ix as never);
    tx.feePayer = user;
    tx.recentBlockhash = (await connection.getLatestBlockhash("confirmed")).blockhash;
    return tx.serialize({ requireAllSignatures: false, verifySignatures: false }).toString("base64");
  } catch {
    return null;
  }
}
