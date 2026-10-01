export type LedgerLine = { accountId: string; amount: bigint; usdValue: number };

export function assertDoubleEntry(lines: LedgerLine[]): void {
  const usd = lines.reduce((s, l) => s + l.usdValue, 0);
  if (Math.abs(usd) > 0.0001) throw new Error(`Ledger USD must net to 0, got ${usd}`);
}

export function applyFill(opts: {
  cashAccountId: string;
  positionAccountId: string;
  cashDelta: bigint;
  tokenDelta: bigint;
  usd: number;
}): LedgerLine[] {
  const lines: LedgerLine[] = [
    { accountId: opts.cashAccountId, amount: opts.cashDelta, usdValue: -opts.usd },
    { accountId: opts.positionAccountId, amount: opts.tokenDelta, usdValue: opts.usd }
  ];
  assertDoubleEntry(lines);
  return lines;
}

export function timeWeightedReturn(points: Array<{ nav: number; flow: number }>): number {
  if (points.length < 2) return 0;
  let r = 1;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!;
    const cur = points[i]!;
    const start = prev.nav + cur.flow;
    if (start <= 0) continue;
    r *= cur.nav / start;
  }
  return r - 1;
}

export function driftBps(
  currentWeights: Record<string, number>,
  targetWeights: Record<string, number>
): { perHolding: Record<string, number>; totalAbs: number } {
  const ids = new Set([...Object.keys(currentWeights), ...Object.keys(targetWeights)]);
  const perHolding: Record<string, number> = {};
  let totalAbs = 0;
  for (const id of ids) {
    const d = (currentWeights[id] ?? 0) - (targetWeights[id] ?? 0);
    perHolding[id] = d;
    totalAbs += Math.abs(d);
  }
  return { perHolding, totalAbs };
}
