export function benchmarkName(world?: string | null) {
  return world === "MEMES" ? "SOL" : "S&P 500";
}

export function benchmarkLabel(world?: string | null) {
  return world === "MEMES" ? "vs SOL" : "vs S&P 500";
}

export function benchmarkSummary(vs: number | null | undefined, world?: string | null, format?: (n: number) => string) {
  const name = benchmarkName(world);
  if (vs == null || !Number.isFinite(vs)) return `No mark vs ${name} yet.`;
  return `${format ? format(vs) : vs} vs ${name}.`;
}
