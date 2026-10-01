export type TickerRow = { ticker: string; cik: string; title: string };

export async function loadSecTickers(): Promise<TickerRow[]> {
  const res = await fetch("https://www.sec.gov/files/company_tickers.json", {
    headers: { "User-Agent": "SuperView research@superview.fun" }
  });
  const json = (await res.json()) as Record<string, { ticker: string; cik_str: number; title: string }>;
  return Object.values(json).map((r) => ({
    ticker: r.ticker,
    cik: String(r.cik_str).padStart(10, "0"),
    title: r.title
  }));
}

export function resolveHoldable(cik: string | null | undefined, universeCiks: Set<string>): boolean {
  if (!cik) return false;
  return universeCiks.has(cik.padStart(10, "0"));
}
