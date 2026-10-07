import { createHash } from "node:crypto";
import { USDC_SOLANA_MINT } from "@takeandstake/shared";
import { solanaRpc } from "./solana-rpc.js";

const TOKEN = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const ATA_PROG = "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL";
const SYSTEM = "11111111111111111111111111111111";
const COMPUTE = "ComputeBudget111111111111111111111111111111";
const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function decodeBase58(s: string): Uint8Array {
  const bytes: number[] = [0];
  for (const ch of s) {
    const val = BASE58.indexOf(ch);
    if (val < 0) return new Uint8Array();
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
  let zeros = 0;
  for (const ch of s) {
    if (ch !== "1") break;
    zeros += 1;
  }
  const body = bytes.reverse();
  const out = new Uint8Array(zeros + body.length);
  out.set(body, zeros);
  return out;
}

function encodeBase58(buf: Uint8Array): string {
  const bytes = [0];
  for (const b of buf) {
    let carry = b;
    for (let i = 0; i < bytes.length; i++) {
      const x = bytes[i]! * 256 + carry;
      bytes[i] = x % 58;
      carry = Math.floor(carry / 58);
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

function concat(...parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function isSolanaPubkey(s: string): boolean {
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(s)) return false;
  return decodeBase58(s).length === 32;
}

export function associatedTokenAddress(owner: string, mint = USDC_SOLANA_MINT, tokenProgram = TOKEN): string {
  const seeds = [decodeBase58(owner), decodeBase58(tokenProgram), decodeBase58(mint)];
  const program = decodeBase58(ATA_PROG);
  const marker = Uint8Array.from(Buffer.from("ProgramDerivedAddress"));
  for (let bump = 255; bump >= 250; bump--) {
    const hash = Uint8Array.from(createHash("sha256").update(concat(...seeds, Uint8Array.of(bump), program, marker)).digest());
    if (hash[31]! < 128) return encodeBase58(hash);
  }
  const hash = Uint8Array.from(createHash("sha256").update(concat(...seeds, Uint8Array.of(255), program, marker)).digest());
  return encodeBase58(hash);
}

function compactU16(n: number): Uint8Array {
  if (n < 128) return Uint8Array.of(n);
  if (n < 16384) return Uint8Array.of(0x80 | (n & 0x7f), n >> 7);
  return Uint8Array.of(0x80 | (n & 0x7f), 0x80 | ((n >> 7) & 0x7f), n >> 14);
}

function u64le(n: bigint): Uint8Array {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64LE(n);
  return Uint8Array.from(buf);
}

function transferData(amount: bigint): Uint8Array {
  return concat(Uint8Array.of(3), u64le(amount));
}

function cuPriceData(microLamports: bigint): Uint8Array {
  return concat(Uint8Array.of(3), u64le(microLamports));
}

function cuLimitData(units: number): Uint8Array {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(units);
  return concat(Uint8Array.of(2), Uint8Array.from(buf));
}

type Acc = { k: string; w?: boolean; s?: boolean };

function serializeLegacy(payer: string, blockhash: string, ixs: Array<{ program: string; accounts: Acc[]; data: Uint8Array }>): string {
  const keys: string[] = [payer];
  const meta = new Map<string, { w: boolean; s: boolean }>([[payer, { w: true, s: true }]]);
  for (const ix of ixs) {
    if (!keys.includes(ix.program)) keys.push(ix.program);
    const cur = meta.get(ix.program) ?? { w: false, s: false };
    meta.set(ix.program, cur);
    for (const a of ix.accounts) {
      if (!keys.includes(a.k)) keys.push(a.k);
      const prev = meta.get(a.k) ?? { w: false, s: false };
      meta.set(a.k, { w: prev.w || Boolean(a.w), s: prev.s || Boolean(a.s) });
    }
  }
  const signedWritable = keys.filter((k) => meta.get(k)?.s && meta.get(k)?.w);
  const signedReadonly = keys.filter((k) => meta.get(k)?.s && !meta.get(k)?.w);
  const unsignedWritable = keys.filter((k) => !meta.get(k)?.s && meta.get(k)?.w);
  const unsignedReadonly = keys.filter((k) => !meta.get(k)?.s && !meta.get(k)?.w);
  const ordered = [...signedWritable, ...signedReadonly, ...unsignedWritable, ...unsignedReadonly];
  const index = new Map(ordered.map((k, i) => [k, i]));
  const header = Uint8Array.of(signedWritable.length + signedReadonly.length, signedReadonly.length, unsignedReadonly.length);
  const keyBytes = concat(...ordered.map((k) => decodeBase58(k)));
  const bh = decodeBase58(blockhash);
  const ixBufs = ixs.map((ix) => {
    const accs = Uint8Array.from(ix.accounts.map((a) => index.get(a.k) ?? 0));
    return concat(
      Uint8Array.of(index.get(ix.program) ?? 0),
      compactU16(accs.length),
      accs,
      compactU16(ix.data.length),
      ix.data
    );
  });
  const message = concat(header, compactU16(ordered.length), keyBytes, bh, compactU16(ixs.length), ...ixBufs);
  const sig = new Uint8Array(64);
  return Buffer.from(concat(compactU16(1), sig, message)).toString("base64");
}

export async function buildUsdcWithdrawTx(opts: {
  owner: string;
  dest: string;
  amountRaw: bigint;
}): Promise<{ tx: string; destAta: string; sourceAta: string } | null> {
  const raw = await solanaRpc<{ value?: { blockhash?: string }; blockhash?: string }>("getLatestBlockhash", [
    { commitment: "confirmed" }
  ]);
  const blockhash = raw?.value?.blockhash ?? raw?.blockhash;
  if (!blockhash) return null;
  const mint = USDC_SOLANA_MINT;
  const sourceAta = associatedTokenAddress(opts.owner, mint);
  const destAta = associatedTokenAddress(opts.dest, mint);
  const tx = serializeLegacy(opts.owner, blockhash, [
    { program: COMPUTE, accounts: [], data: cuLimitData(200_000) },
    { program: COMPUTE, accounts: [], data: cuPriceData(100_000n) },
    {
      program: ATA_PROG,
      accounts: [
        { k: opts.owner, w: true, s: true },
        { k: destAta, w: true },
        { k: opts.dest },
        { k: mint },
        { k: SYSTEM },
        { k: TOKEN }
      ],
      data: Uint8Array.of(1)
    },
    {
      program: TOKEN,
      accounts: [
        { k: sourceAta, w: true },
        { k: destAta, w: true },
        { k: opts.owner, s: true }
      ],
      data: transferData(opts.amountRaw)
    }
  ]);
  return { tx, destAta, sourceAta };
}
