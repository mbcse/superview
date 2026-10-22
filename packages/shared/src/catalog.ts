import { BASE_CHAIN_ID, MONAD_CHAIN_ID, ROBINHOOD_CHAIN_ID, SOLANA_CHAIN_ID, isKnownChainId } from "./chains.js";
import { companyTicker } from "./identity.js";

const CHAIN_QUERY: Record<string, number> = {
  monad: MONAD_CHAIN_ID,
  solana: SOLANA_CHAIN_ID,
  sol: SOLANA_CHAIN_ID,
  base: BASE_CHAIN_ID,
  robinhood: ROBINHOOD_CHAIN_ID,
  rh: ROBINHOOD_CHAIN_ID
};

const CATALOG_NOISE = /^(stocks?|tokens?|xstocks?|coin|coins)$/i;

export function catalogSearch(q: string): { chainId?: number; text?: string } {
  const parts = q.trim().split(/\s+/).filter(Boolean);
  let chainId: number | undefined;
  const rest: string[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (Number.isFinite(n) && isKnownChainId(n) && chainId == null) {
      chainId = n;
      continue;
    }
    const aliased = CHAIN_QUERY[part.toLowerCase()];
    if (aliased != null && chainId == null) {
      chainId = aliased;
      continue;
    }
    if (CATALOG_NOISE.test(part)) continue;
    rest.push(part);
  }
  const text = rest.join(" ").trim();
  return { ...(chainId != null ? { chainId } : {}), ...(text ? { text } : {}) };
}

export function catalogHitRank(
  row: { symbol: string; name: string; underlyingTicker?: string | null },
  q: string
): number {
  if (!q) return 0;
  const u = q.toUpperCase();
  const sym = row.symbol.toUpperCase();
  const und = (row.underlyingTicker || companyTicker(sym)).toUpperCase();
  const name = row.name.toUpperCase();
  if (und === u || sym === u) return 0;
  if (sym === `${u}X` || sym === `${u}C` || sym === `RH${u}`) return 1;
  if (und.startsWith(u) || sym.startsWith(u)) return 2;
  if (name.includes(u)) return 3;
  return 4;
}
