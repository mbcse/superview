"use client";

import { signMeraEvmTransaction, signMeraSolanaMessage } from "./mera";

export type MeraIntent = {
  kind: "evm" | "solana";
  purpose: "approve" | "swap";
  legId: string;
  chainId: number;
  to?: string;
  data?: string;
  value?: string;
  nonce?: number;
  gas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
  type?: "eip1559" | "legacy";
  message?: string;
};

export type SignedMeraIntent = {
  legId: string;
  purpose: "approve" | "swap";
  signedTx?: string;
  signature?: string;
};

function asHex(value: string | undefined, fallback = "0x0"): `0x${string}` {
  if (!value) return fallback as `0x${string}`;
  return (value.startsWith("0x") ? value : `0x${value}`) as `0x${string}`;
}

function asBigInt(value: string | undefined) {
  if (!value) return undefined;
  return BigInt(value);
}

export async function signMeraIntents(intents: MeraIntent[]): Promise<SignedMeraIntent[]> {
  const signed: SignedMeraIntent[] = [];
  for (const intent of intents) {
    if (intent.kind === "solana") {
      if (!intent.message) throw new Error("mera_missing_solana_message");
      const bytes = Uint8Array.from(atob(intent.message), (c) => c.charCodeAt(0));
      const { signature } = await signMeraSolanaMessage(bytes);
      signed.push({
        legId: intent.legId,
        purpose: intent.purpose,
        signature: btoa(String.fromCharCode(...signature))
      });
      continue;
    }
    if (!intent.to || intent.nonce == null || !intent.gas) throw new Error("mera_missing_evm_fields");
    const signedTx = await signMeraEvmTransaction({
      to: asHex(intent.to),
      data: intent.data ? asHex(intent.data) : undefined,
      value: asBigInt(intent.value) ?? 0n,
      nonce: intent.nonce,
      gas: asBigInt(intent.gas) ?? 21000n,
      chainId: intent.chainId,
      maxFeePerGas: asBigInt(intent.maxFeePerGas),
      maxPriorityFeePerGas: asBigInt(intent.maxPriorityFeePerGas),
      gasPrice: asBigInt(intent.gasPrice),
      type: intent.type ?? (intent.maxFeePerGas ? "eip1559" : "legacy")
    });
    signed.push({
      legId: intent.legId,
      purpose: intent.purpose,
      signedTx
    });
  }
  return signed;
}
