export type HotSets = { t1: string[]; t2: string[]; t3: string[] };

export function partitionHotSets(opts: {
  pocketAssetIds: string[];
  trendingAssetIds: string[];
  publishedAssetIds: string[];
  xstockIds: string[];
  capT1?: number;
}): HotSets {
  const t1cap = opts.capT1 ?? 80;
  const t1 = unique([...opts.pocketAssetIds, ...opts.xstockIds]).slice(0, t1cap);
  const t1set = new Set(t1);
  const t2 = unique(opts.trendingAssetIds.filter((id) => !t1set.has(id))).slice(0, 200);
  const t2set = new Set([...t1set, ...t2]);
  const t3 = unique(opts.publishedAssetIds.filter((id) => !t2set.has(id))).slice(0, 400);
  return { t1, t2, t3 };
}

function unique(ids: string[]) {
  return [...new Set(ids.filter(Boolean))];
}

export function xstockDeviationBand(inSession: boolean) {
  return inSession ? 0.015 : 0.04;
}

export function quotesDisagree(a: number, b: number, band: number) {
  if (!(a > 0) || !(b > 0)) return false;
  return Math.abs(a - b) / a > band;
}
