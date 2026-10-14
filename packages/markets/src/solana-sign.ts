import { PublicKey, VersionedTransaction } from "@solana/web3.js";

function bytes(b64: string) {
  return Uint8Array.from(Buffer.from(b64, "base64"));
}

function toB64(raw: ArrayLike<number>) {
  return Buffer.from(Array.from(raw)).toString("base64");
}

export function solanaMessageToSign(unsignedB64: string): string {
  const tx = VersionedTransaction.deserialize(bytes(unsignedB64));
  return toB64(tx.message.serialize());
}

export function attachSolanaSignature(unsignedB64: string, signatureB64: string, owner: string): string {
  const tx = VersionedTransaction.deserialize(bytes(unsignedB64));
  const sig = bytes(signatureB64);
  if (sig.length !== 64) throw new Error("bad_signature_length");
  tx.addSignature(new PublicKey(owner), sig);
  if (!tx.signatures.some((row) => row.length === 64 && !row.every((b) => b === 0))) {
    throw new Error("signature_not_attached");
  }
  return toB64(tx.serialize());
}
