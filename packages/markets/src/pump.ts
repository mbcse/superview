import { createHash } from "node:crypto";
import { pctToFraction, SOLANA_CHAIN_ID } from "@takeandstake/shared";
import { jupiterSearch, type JupiterTokenInfo } from "./jupiter.js";
import { getMultipleAccounts } from "./solana-rpc.js";
import type { Quote } from "./types.js";

const PUMP_PROGRAM = "6EF8rrecthR5Dkzon8Nwu78hRvfCCubJ2FS9g56WvevH";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decodeBase58(s: string): Buffer {
  const bytes: number[] = [0];
  for (const ch of s) {
    const val = BASE58.indexOf(ch);
    if (val < 0) return Buffer.alloc(0);
    let carry = val;
    for (let i = 0; i < bytes.length; i++) {
      const x = bytes[i]! * 58 + carry;
      bytes[i] = x & 255;
      carry = x >> 8;
    }
    while (carry) {
      bytes.push(carry & 255);
      carry >>= 8;
    }
  }
  for (const ch of s) {
    if (ch !== "1") break;
    bytes.push(0);
  }
  return Buffer.from(bytes.reverse());
}

function encodeBase58(buf: Uint8Array): string {
  const bytes = [0];
  for (const b of buf) {
    let carry = b;
    for (let i = 0; i < bytes.length; i++) {
      const x = bytes[i]! * 256 + carry;
      bytes[i] = x % 58;
      carry = Math.floor(x / 58);
    }
    while (carry) {
      bytes.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let zeros = 0;
  for (const b of buf) {
    if (b !== 0) break;
    zeros += 1;
  }
  return "1".repeat(zeros) + bytes.reverse().map((i) => BASE58[i]).join("");
}

function concatBytes(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Pump bonding-curve PDA: seeds `["bonding-curve", mint]`. Bump 255 is the published curve. */
export function pumpCurvePda(mint: string): string {
  const mintKey = Uint8Array.from(decodeBase58(mint));
  const program = Uint8Array.from(decodeBase58(PUMP_PROGRAM));
  const seed = Uint8Array.from(Buffer.from("bonding-curve"));
  const marker = Uint8Array.from(Buffer.from("ProgramDerivedAddress"));
  for (let bump = 255; bump >= 253; bump--) {
    const pre = concatBytes(seed, mintKey, Uint8Array.of(bump), program, marker);
    const hash = createHash("sha256").update(pre).digest();
    if (hash[31]! < 128) return encodeBase58(Uint8Array.from(hash));
  }
  const pre = concatBytes(seed, mintKey, Uint8Array.of(255), program, marker);
  return encodeBase58(Uint8Array.from(createHash("sha256").update(pre).digest()));
}

/** Tokens out for a SOL-in buy on the constant-product virtual curve. */
export function pumpBuyQuote(virtualSol: bigint, virtualToken: bigint, solIn: bigint): { tokensOut: bigint; priceSol: number } {
  if (virtualToken <= 0n || virtualSol <= 0n || solIn <= 0n) return { tokensOut: 0n, priceSol: 0 };
  const k = virtualSol * virtualToken;
  const nextSol = virtualSol + solIn;
  const nextTok = k / nextSol;
  const tokensOut = virtualToken > nextTok ? virtualToken - nextTok : 0n;
  return { tokensOut, priceSol: pumpCurvePriceSol(virtualSol, virtualToken) };
}

export async function pumpDiscover(query = "pump"): Promise<JupiterTokenInfo[]> {
  const rows = await jupiterSearch(query);
  return rows.filter((r) => /pump/i.test(String(r.launchpad ?? r.tags?.join(" ") ?? "")));
}

export function pumpVenue(row: JupiterTokenInfo): "PUMP_CURVE" | "PUMPSWAP" | "AMM" {
  if (row.graduatedAt) return "PUMPSWAP";
  if (/pump/i.test(String(row.launchpad ?? ""))) return "PUMP_CURVE";
  return "AMM";
}

/** Price in SOL from Pump bonding-curve virtual reserves (official SDK math). */
export function pumpCurvePriceSol(virtualSol: bigint, virtualToken: bigint): number {
  if (virtualToken <= 0n) return 0;
  return Number(virtualSol) / Number(virtualToken);
}

export function decodePumpCurve(dataB64: string): { virtualSol: bigint; virtualToken: bigint; complete: boolean } | null {
  try {
    const buf = Buffer.from(dataB64, "base64");
    if (buf.length < 49) return null;
    const virtualToken = buf.readBigUInt64LE(8);
    const virtualSol = buf.readBigUInt64LE(16);
    const complete = buf[48] === 1;
    return { virtualSol, virtualToken, complete };
  } catch {
    return null;
  }
}

export async function pumpCurveQuotes(
  curveAccounts: Array<{ mint: string; curve?: string }>,
  solUsd: number
): Promise<Map<string, Quote>> {
  const out = new Map<string, Quote>();
  const resolved = curveAccounts.map((c) => ({ mint: c.mint, curve: c.curve || pumpCurvePda(c.mint) }));
  const rows = await getMultipleAccounts(resolved.map((c) => c.curve));
  const now = Date.now();
  for (const row of rows) {
    if (!row.data) continue;
    const decoded = decodePumpCurve(row.data);
    if (!decoded || decoded.complete) continue;
    const sol = pumpCurvePriceSol(decoded.virtualSol, decoded.virtualToken);
    const last = sol * solUsd;
    if (!(last > 0)) continue;
    const mint = resolved.find((c) => c.curve === row.pubkey)?.mint;
    if (!mint) continue;
    out.set(mint, {
      assetId: mint,
      last,
      chg: null,
      liquidityUsd: null,
      observedAt: now,
      provider: "PUMPFUN",
      halt: false
    });
  }
  return out;
}

export function quoteFromPumpInfo(row: JupiterTokenInfo): Quote | null {
  const last = Number((row as { usdPrice?: number }).usdPrice);
  if (!Number.isFinite(last) || last <= 0) return null;
  return {
    assetId: row.id,
    last,
    chg: pctToFraction((row as { stats24h?: { priceChange?: number } }).stats24h?.priceChange ?? null),
    liquidityUsd: row.liquidity ?? null,
    observedAt: Date.now(),
    provider: "PUMPFUN",
    halt: false
  };
}

export { SOLANA_CHAIN_ID, PUMP_PROGRAM };
