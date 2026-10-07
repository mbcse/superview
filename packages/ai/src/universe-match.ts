import { displaySymbol } from "@takeandstake/shared";

export type UniverseRow = {
  tokenId: string;
  symbol: string;
  legalName: string;
  businessSummary: string;
  sector: string | null;
};

export function matchNameToUniverse(name: string, universe: UniverseRow[]): UniverseRow | null {
  const n = name.toLowerCase().replace(/[^a-z0-9\s]/g, " ").trim();
  for (const row of universe) {
    const legal = row.legalName.toLowerCase();
    const sym = displaySymbol(row.symbol).toLowerCase();
    if (n === legal || n.includes(legal) || legal.includes(n)) return row;
    if (sym.length >= 2 && (n.includes(sym) || n.includes(legal.split(" ")[0] ?? ""))) return row;
  }
  return null;
}
