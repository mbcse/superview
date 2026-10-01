export function hiddenOverlap(
  pockets: Array<{ holdings: Array<{ symbol: string; weightBps: number }> }>
): Array<{ symbol: string; avgBps: number }> {
  const acc = new Map<string, number>();
  for (const p of pockets) {
    for (const h of p.holdings) acc.set(h.symbol, (acc.get(h.symbol) ?? 0) + h.weightBps);
  }
  const n = Math.max(pockets.length, 1);
  return [...acc.entries()]
    .map(([symbol, bps]) => ({ symbol, avgBps: Math.round(bps / n) }))
    .sort((a, b) => b.avgBps - a.avgBps);
}
