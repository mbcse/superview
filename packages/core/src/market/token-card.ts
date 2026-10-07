import { prisma } from "@takeandstake/db";
import { displaySymbol, robinhoodAliases } from "@takeandstake/shared";

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

function symbolsFor(raw: string) {
  return robinhoodAliases(raw.trim());
}

export async function loadTokenCard(symbol: string): Promise<{ card: TokenCard; tokenId: string } | null> {
  const raw = symbol.trim();
  const symbols = [...new Set([...symbolsFor(raw), raw, raw.replace(/x$/i, ""), `${raw.replace(/x$/i, "")}x`])].filter(Boolean);
  if (!symbols.length) return null;
  const tokens = await prisma.stockToken.findMany({
    where: { OR: symbols.map((s) => ({ symbol: { equals: s, mode: "insensitive" } })) },
    include: { universe: true }
  });
  const token = tokens.find((t) => t.universe) ?? tokens[0];
  if (!token) return null;
  const siblings = token.isin
    ? await prisma.stockToken.findMany({
        where: { isin: token.isin, status: "ACTIVE" },
        select: { id: true, symbol: true, chainId: true, source: true, contractAddress: true }
      })
    : tokens.map((t) => ({ id: t.id, symbol: t.symbol, chainId: t.chainId, source: t.source, contractAddress: t.contractAddress }));
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
      listings: siblings.map((t) => ({
        id: t.id,
        symbol: displaySymbol(t),
        chainId: t.chainId,
        source: t.source,
        contractAddress: t.contractAddress
      }))
    }
  };
}
