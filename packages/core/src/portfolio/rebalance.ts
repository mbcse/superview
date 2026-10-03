export type RebalanceTrade = {
  tokenId: string;
  side: "BUY" | "SELL";
  usd: number;
};

export function planRebalanceTrades(
  navUsd: number,
  current: Array<{ tokenId: string; usd: number }>,
  target: Array<{ tokenId: string; weightBps: number }>,
  skipUsd = 5
): RebalanceTrade[] {
  if (!(navUsd > 0)) return [];
  const currentUsd = new Map<string, number>();
  for (const row of current) {
    currentUsd.set(row.tokenId, (currentUsd.get(row.tokenId) ?? 0) + row.usd);
  }
  const ids = new Set([...currentUsd.keys(), ...target.map((t) => t.tokenId)]);
  const targetUsd = new Map<string, number>();
  for (const t of target) {
    targetUsd.set(t.tokenId, (navUsd * t.weightBps) / 10_000);
  }
  const sells: RebalanceTrade[] = [];
  const buys: RebalanceTrade[] = [];
  for (const id of ids) {
    const delta = (targetUsd.get(id) ?? 0) - (currentUsd.get(id) ?? 0);
    if (Math.abs(delta) < skipUsd) continue;
    if (delta < 0) sells.push({ tokenId: id, side: "SELL", usd: -delta });
    else buys.push({ tokenId: id, side: "BUY", usd: delta });
  }
  return [...sells, ...buys];
}
