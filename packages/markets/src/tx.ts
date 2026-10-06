import { inspectSolanaIxs, type Ix } from "./inspect.js";

function compactU16(buf: Buffer, offset: number): { n: number; next: number } {
  let n = 0;
  let shift = 0;
  let i = offset;
  while (i < buf.length) {
    const b = buf[i]!;
    n |= (b & 0x7f) << shift;
    i += 1;
    if ((b & 0x80) === 0) break;
    shift += 7;
  }
  return { n, next: i };
}

/** Best-effort decode of a base64 Solana tx into top-level program ids. */
export function decodeSolanaProgramIds(b64: string): string[] {
  try {
    const buf = Buffer.from(b64, "base64");
    if (buf.length < 40) return [];
    let i = 0;
    if ((buf[0]! & 0x80) !== 0) i = 1;
    const sigs = compactU16(buf, i);
    i = sigs.next + sigs.n * 64;
    if (i + 3 >= buf.length) return [];
    i += 3;
    const keys = compactU16(buf, i);
    i = keys.next;
    const accounts: string[] = [];
    for (let k = 0; k < keys.n && i + 32 <= buf.length; k++) {
      accounts.push(encodeBase58(Uint8Array.from(buf.subarray(i, i + 32))));
      i += 32;
    }
    i += 32;
    const ixs = compactU16(buf, i);
    i = ixs.next;
    const programs: string[] = [];
    for (let n = 0; n < ixs.n && i < buf.length; n++) {
      const idx = buf[i]!;
      i += 1;
      const acc = compactU16(buf, i);
      i = acc.next + acc.n;
      const data = compactU16(buf, i);
      i = data.next + data.n;
      const pid = accounts[idx];
      if (pid) programs.push(pid);
    }
    return [...new Set(programs)];
  } catch {
    return [];
  }
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function encodeBase58(bytes: Uint8Array): string {
  const out: number[] = [0];
  for (const b of bytes) {
    let carry = b;
    for (let i = 0; i < out.length; i++) {
      const x = out[i]! * 256 + carry;
      out[i] = x % 58;
      carry = Math.floor(x / 58);
    }
    while (carry) {
      out.push(carry % 58);
      carry = Math.floor(carry / 58);
    }
  }
  let zeros = 0;
  for (const b of bytes) {
    if (b !== 0) break;
    zeros += 1;
  }
  return "1".repeat(zeros) + out.reverse().map((n) => BASE58[n]).join("");
}

export function inspectBuiltTx(b64: string, ownerAccounts: string[]): { ok: boolean; reason?: string; ixs: Ix[] } {
  const programs = decodeSolanaProgramIds(b64);
  const ixs: Ix[] = programs.map((programId) => ({ programId, accounts: ownerAccounts }));
  return { ...inspectSolanaIxs(ixs, ownerAccounts), ixs };
}
