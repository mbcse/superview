import { prisma } from "@takeandstake/db";
import { companyTicker, displaySymbol, isLiveStockChain, robinhoodAliases, STOCK_CHAIN_IDS } from "@takeandstake/shared";

export type TokenCard = {
  symbol: string;
  name: string;
  legalName: string | null;
  sector: string | null;
  industry: string | null;
  logoUrl: string | null;
  about: string | null;
  listings?: Array<{ id: string; symbol: string; chainId: number; source: string; contractAddress: string }>;
};

export function isJunkAbout(text: string) {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length < 40) return true;
  if (t.startsWith("{") || t.startsWith("[")) return true;
  if (/"run_id"|interaction_id|processor":"lite"|trun_[a-f0-9]/i.test(t)) return true;
  if (/indiana retailers|SNAP violations|food stamp/i.test(t)) return true;
  if (/^SEC Snap Inc/i.test(t) && /Recent news/i.test(t)) return true;
  return false;
}

export function cleanAbout(raw: unknown): string | null {
  if (raw == null) return null;
  let text = "";
  if (typeof raw === "string") text = raw;
  else if (typeof raw === "object") {
    const d = (raw as { description?: unknown }).description;
    if (typeof d === "string") text = d;
  }
  text = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text || isJunkAbout(text)) return null;
  return text.slice(0, 800);
}

export function tokenLookupSymbols(raw: string): string[] {
  const t = raw.trim();
  if (!t) return [];
  const bare = t.replace(/[xc]$/i, "");
  return [...new Set([...robinhoodAliases(t), t, bare, `${bare}x`, `${bare}c`])].filter(Boolean);
}

export function listingChainOrder(chainId: number): number {
  const order = [4663, 101, 8453, 143];
  const i = order.indexOf(chainId);
  return i === -1 ? 99 : i;
}

export function pickTokenCardRow<T extends { symbol: string; status?: string | null; universe?: unknown; chainId?: number }>(
  tokens: T[],
  raw: string
): T | undefined {
  const want = raw.trim().toUpperCase();
  const active = tokens.filter((t) => t.status !== "INACTIVE" && t.status !== "HALTED");
  const pool = active.length ? active : tokens;
  const live = pool.filter((t) => t.chainId != null && isLiveStockChain(t.chainId));
  const prefer = live.length ? live : pool;
  return (
    prefer.find((t) => t.symbol.toUpperCase() === want) ??
    prefer.find((t) => t.universe) ??
    prefer[0] ??
    pool.find((t) => t.symbol.toUpperCase() === want) ??
    pool.find((t) => t.universe) ??
    pool[0]
  );
}

export async function loadTokenCard(symbol: string): Promise<{ card: TokenCard; tokenId: string } | null> {
  const raw = symbol.trim();
  const symbols = tokenLookupSymbols(raw);
  const tickers = [...new Set(symbols.map((s) => companyTicker(s)).filter(Boolean))];
  if (!symbols.length) return null;
  const tokens = await prisma.stockToken.findMany({
    where: {
      OR: [
        ...symbols.map((s) => ({ symbol: { equals: s, mode: "insensitive" as const } })),
        ...tickers.map((s) => ({ underlyingTicker: { equals: s, mode: "insensitive" as const } }))
      ]
    },
    include: { universe: true }
  });
  const token = pickTokenCardRow(tokens, raw);
  if (!token) return null;
  const siblingWhere = [
    ...(token.isin ? [{ isin: token.isin }] : []),
    ...(token.underlyingTicker ? [{ underlyingTicker: token.underlyingTicker }] : [])
  ];
  const siblings = siblingWhere.length
    ? await prisma.stockToken.findMany({
        where: { status: "ACTIVE", OR: siblingWhere },
        select: { id: true, symbol: true, chainId: true, source: true, contractAddress: true }
      })
    : tokens.map((t) => ({ id: t.id, symbol: t.symbol, chainId: t.chainId, source: t.source, contractAddress: t.contractAddress }));
  const visible = siblings.filter(
    (t) => !STOCK_CHAIN_IDS.includes(t.chainId) || isLiveStockChain(t.chainId)
  );
  visible.sort((a, b) => listingChainOrder(a.chainId) - listingChainOrder(b.chainId) || a.symbol.localeCompare(b.symbol));
  const u = token.universe;
  const about = cleanAbout(u?.businessSummary) ?? cleanAbout(u?.profile);
  const name = (u?.legalName || token.name || displaySymbol(token)).trim();
  return {
    tokenId: token.id,
    card: {
      symbol: displaySymbol(token),
      name,
      legalName: u?.legalName ?? null,
      sector: u?.sector ?? null,
      industry: u?.industry ?? null,
      logoUrl: token.logoUrl ?? null,
      about,
      listings: visible.map((t) => ({
        id: t.id,
        symbol: displaySymbol(t),
        chainId: t.chainId,
        source: t.source,
        contractAddress: t.contractAddress
      }))
    }
  };
}
