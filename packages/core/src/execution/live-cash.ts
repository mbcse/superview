export const LIVE_MIN_TRADE_USD = 1;
export const LIVE_DUST_USD = 0.4;

export function liveSpendUsd(amountUsd: number | undefined, onchainUsd: number, capDay: number) {
  const spend = Math.min(amountUsd ?? onchainUsd, onchainUsd, capDay);
  if (!Number.isFinite(spend) || spend < LIVE_MIN_TRADE_USD) return null;
  return spend;
}

export function isDustLeg(usd: number, min = LIVE_DUST_USD) {
  return !Number.isFinite(usd) || usd < min;
}

export function liveIdempotencyParts(pocketId: string, spendUsd: number, targetId: string, chainId: number) {
  return ["live", pocketId, String(Math.round(spendUsd * 100)), targetId, String(chainId)];
}

export function sumCashUsd(accounts: Array<{ kind: string; entries: Array<{ usdValue: unknown }> }>) {
  return accounts
    .filter((a) => a.kind === "CASH")
    .reduce((s, a) => s + a.entries.reduce((t, e) => t + Number(e.usdValue ?? 0), 0), 0);
}

export function homeCashUsd(balances: Array<{ chainId: number; symbol: string; usd: number | null }>) {
  return balances.reduce((s, b) => {
    if ((b.chainId === 8453 || b.chainId === 101) && b.symbol.toUpperCase() === "USDC" && b.usd != null) {
      return s + b.usd;
    }
    return s;
  }, 0);
}
