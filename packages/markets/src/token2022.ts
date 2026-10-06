const EXT: Record<number, string> = {
  1: "transferFee",
  6: "defaultFrozen",
  9: "nonTransferable",
  12: "permanentDelegate",
  14: "transferHook"
};

export function token2022RiskFromMint(dataB64: string): string[] {
  const buf = Buffer.from(dataB64, "base64");
  if (buf.length <= 82) return [];
  const out: string[] = [];
  let i = 82;
  while (i + 4 <= buf.length) {
    const type = buf.readUInt16LE(i);
    const len = buf.readUInt16LE(i + 2);
    if (len > 1024) break;
    const name = EXT[type];
    if (name) out.push(name);
    i += 4 + len;
  }
  return [...new Set(out)];
}
