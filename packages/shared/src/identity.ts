import { isSolanaChain } from "./chains.js";
import type { AssetSource } from "./worlds.js";

export type SymbolSource = { symbol: string; source?: AssetSource | string | null };

/** Strip the Robinhood RH prefix only for Robinhood-sourced rows. */
export function displaySymbol(asset: SymbolSource | string, source?: AssetSource | string | null): string {
  if (typeof asset === "string") {
    const src = source ?? "ROBINHOOD";
    const u = asset.toUpperCase();
    if (src === "ROBINHOOD" && u.startsWith("RH") && u.length > 2) return u.slice(2);
    return u;
  }
  const src = asset.source ?? source ?? "ROBINHOOD";
  const u = String(asset.symbol ?? "").toUpperCase();
  if (src === "ROBINHOOD" && u.startsWith("RH") && u.length > 2) return u.slice(2);
  return u;
}

export function robinhoodAliases(symbol: string): string[] {
  const u = symbol.toUpperCase();
  const bare = u.startsWith("RH") && u.length > 2 ? u.slice(2) : u;
  return Array.from(new Set([u, bare, `RH${bare}`]));
}

/** Lookup keys: RH aliases only for Robinhood rows. */
export function symbolKeys(symbol: string, source?: AssetSource | string | null): string[] {
  const u = symbol.toUpperCase();
  if (source && source !== "ROBINHOOD") return [u];
  return robinhoodAliases(u);
}

export function symbolsMatch(a: string, b: string, source?: AssetSource | string | null): boolean {
  const want = new Set(symbolKeys(a, source));
  return symbolKeys(b, source).some((k) => want.has(k));
}

export function pctToFraction(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.abs(value) > 1.5 ? value / 100 : value;
}

export function qtyFromRaw(raw: unknown, decimals: number, multiplier = 1): number {
  const n = Number(raw ?? 0);
  if (!Number.isFinite(n) || decimals < 0) return 0;
  return (n / 10 ** decimals) * multiplier;
}

export function rawFromQty(qty: number, decimals: number): bigint {
  if (!Number.isFinite(qty) || qty <= 0) return 0n;
  return BigInt(Math.floor(qty * 10 ** decimals));
}

export function multiplierToNumber(raw: string | null | undefined): number {
  if (!raw) return 1;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 1;
  if (n > 1e12) return n / 1e18;
  return n;
}

export function sanitizeCatalogText(text: string, max = 280): string {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM = /^0x[a-fA-F0-9]{40}$/;

export function isMintOrContract(value: string, chainId: number): boolean {
  if (isSolanaChain(chainId)) return BASE58.test(value);
  return EVM.test(value);
}

/** Company key across issuers: RHNVDA, NVDAx, NVDAc, NVDA -> NVDA. */
export function underlyingTicker(symbol: string, source?: AssetSource | string | null): string {
  let u = String(symbol ?? "").toUpperCase().trim();
  if (!u) return "";
  if ((source === "ROBINHOOD" || !source) && u.startsWith("RH") && u.length > 2) u = u.slice(2);
  if (source === "XSTOCKS" && u.endsWith("X") && u.length > 1) u = u.slice(0, -1);
  if (source === "COINBASE" && u.endsWith("C") && u.length > 1) u = u.slice(0, -1);
  return u;
}

export function companyTicker(symbol: string, source?: AssetSource | string | null): string {
  if (source) return underlyingTicker(symbol, source);
  return underlyingTicker(underlyingTicker(underlyingTicker(symbol, "ROBINHOOD"), "XSTOCKS"), "COINBASE");
}

export type IssuerListing = {
  chainId: number;
  address?: string | null;
  symbol?: string | null;
  source?: AssetSource | string | null;
  isin?: string | null;
};

export function normalizeTokenAddress(address: string, chainId: number): string {
  const raw = String(address ?? "").trim();
  const a = isSolanaChain(chainId) ? raw : raw.toLowerCase();
  if (!isMintOrContract(a, chainId)) return "";
  return a;
}

export function sameTokenAddress(a?: string | null, b?: string | null, chainId?: number): boolean {
  if (chainId == null) return false;
  const left = normalizeTokenAddress(String(a ?? ""), chainId);
  const right = normalizeTokenAddress(String(b ?? ""), chainId);
  return Boolean(left && left === right);
}

/** Price or catalog bind: same chain, same contract, same company ticker; ISIN if both sides have one. */
export function sameIssuerListing(held: IssuerListing, issuer: IssuerListing): boolean {
  if (!Number.isFinite(held.chainId) || held.chainId !== issuer.chainId) return false;
  if (!sameTokenAddress(held.address, issuer.address, held.chainId)) return false;
  const heldTicker = companyTicker(held.symbol ?? "", held.source);
  const issuerTicker = companyTicker(issuer.symbol ?? "", issuer.source);
  if (!heldTicker || !issuerTicker || heldTicker !== issuerTicker) return false;
  const heldIsin = String(held.isin ?? "").trim();
  const issuerIsin = String(issuer.isin ?? "").trim();
  if (heldIsin && issuerIsin && heldIsin !== issuerIsin) return false;
  return true;
}
