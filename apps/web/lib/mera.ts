"use client";

import { HDKey } from "@scure/bip32";
import { entropyToMnemonic, mnemonicToSeedSync } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english.js";
import { API_ORIGIN } from "./fmt";

const MERA_TOKEN = "superview-mera-token";
const MERA_CREDENTIAL = "superview.mera.credential";

export type MeraCredential = {
  credentialId: string;
  transports?: readonly string[];
};

export type MeraSessionInfo = {
  evmAddress: `0x${string}`;
  solanaAddress: string;
  credentialId: string;
};

type EvmSession = {
  end: () => void;
};
type SolSession = {
  publicKey: Uint8Array;
  signMessage: (message: Uint8Array) => Promise<Uint8Array>;
  end: () => void;
};

let evmSession: EvmSession | undefined;
let solSession: SolSession | undefined;
let cached: MeraSessionInfo | null = null;

export function meraToken() {
  try {
    return localStorage.getItem(MERA_TOKEN);
  } catch {
    return null;
  }
}

export function setMeraToken(token: string | null) {
  try {
    if (token) localStorage.setItem(MERA_TOKEN, token);
    else localStorage.removeItem(MERA_TOKEN);
  } catch {
    /* ignore */
  }
}

export function prfSupported() {
  return typeof window !== "undefined" && typeof PublicKeyCredential !== "undefined" && window.isSecureContext;
}

function rpId() {
  return process.env.NEXT_PUBLIC_MERA_RP_ID || (typeof location !== "undefined" ? location.hostname : "localhost");
}

function readCredential(): MeraCredential | undefined {
  try {
    const raw = localStorage.getItem(MERA_CREDENTIAL);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as MeraCredential;
    return parsed.credentialId ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function meraCredential() {
  if (typeof window === "undefined") return undefined;
  return readCredential();
}

function writeCredential(cred: MeraCredential) {
  localStorage.setItem(MERA_CREDENTIAL, JSON.stringify(cred));
}

function deriveEvmKey(prfOutput: Uint8Array, index = 0): Uint8Array {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/60'/0'/0/${index}`);
  if (node.privateKey === null) throw new Error("derivation produced no key");
  return node.privateKey;
}

function deriveSolanaKey(prfOutput: Uint8Array, index = 0): Uint8Array {
  const seed = mnemonicToSeedSync(entropyToMnemonic(prfOutput, wordlist));
  const node = HDKey.fromMasterSeed(seed).derive(`m/44'/501'/${index}'/0'`);
  if (node.privateKey === null) throw new Error("derivation produced no key");
  return node.privateKey;
}

function endSessions() {
  evmSession?.end();
  solSession?.end();
  evmSession = undefined;
  solSession = undefined;
}

export function disconnectMera() {
  endSessions();
  cached = null;
  setMeraToken(null);
}

async function unlockFromPrf(prfOutput: Uint8Array, credentialId: string): Promise<MeraSessionInfo> {
  const mera = await import("@category-labs/mera");
  const { toViemAccount } = await import("@category-labs/mera/viem");
  endSessions();
  const evm = mera.createSecp256k1SigningSession({ privateKey: deriveEvmKey(prfOutput) });
  const sol = mera.createEd25519SigningSession({ privateKey: deriveSolanaKey(prfOutput) });
  evmSession = evm;
  solSession = sol;
  const evmAddress = toViemAccount(evm).address;
  const solanaAddress = mera.getSolanaAddress(sol.publicKey);
  cached = { evmAddress, solanaAddress, credentialId };
  return cached;
}

async function unlockPasskey(): Promise<MeraSessionInfo> {
  if (!prfSupported()) throw new Error("passkey_unsupported");
  const { createPasskeyWithPrfOutput, getPasskeyPrfOutput, isMeraError } = await import("@category-labs/mera");
  const stored = readCredential();
  try {
    const got = await getPasskeyPrfOutput({
      rpId: rpId(),
      credential: stored
    });
    writeCredential({
      credentialId: got.credentialId,
      transports: stored?.transports
    });
    return unlockFromPrf(got.prfOutput, got.credentialId);
  } catch (error) {
    if (stored) throw error;
    if (isMeraError(error) && error.code === "PRF_UNAVAILABLE") throw error;
    const created = await createPasskeyWithPrfOutput({
      rp: { id: rpId(), name: "SuperView" },
      user: { name: "superview", displayName: "SuperView" }
    });
    writeCredential({
      credentialId: created.credentialId,
      transports: created.transports
    });
    return unlockFromPrf(created.prfOutput, created.credentialId);
  }
}

export function meraAddresses() {
  return cached;
}

export async function ensureMeraSession() {
  if (evmSession && solSession && cached) return cached;
  return unlockPasskey();
}

export async function signMeraPersonalMessage(message: string) {
  const info = await ensureMeraSession();
  if (!evmSession) throw new Error("mera_session_ended");
  const { toViemAccount } = await import("@category-labs/mera/viem");
  const account = toViemAccount(evmSession as never);
  const signature = await account.signMessage({ message });
  return { address: account.address, signature, solanaAddress: info.solanaAddress, credentialId: info.credentialId };
}

export async function signMeraEvmTransaction(tx: {
  to: `0x${string}`;
  data?: `0x${string}`;
  value?: bigint;
  nonce: number;
  gas: bigint;
  chainId: number;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  gasPrice?: bigint;
  type?: "eip1559" | "legacy";
}) {
  await ensureMeraSession();
  if (!evmSession) throw new Error("mera_session_ended");
  const { toViemAccount } = await import("@category-labs/mera/viem");
  const account = toViemAccount(evmSession as never);
  return account.signTransaction(tx as Parameters<typeof account.signTransaction>[0]);
}

export async function signMeraSolanaMessage(message: Uint8Array) {
  await ensureMeraSession();
  if (!solSession) throw new Error("mera_session_ended");
  const signature = await solSession.signMessage(message);
  return { signature, publicKey: solSession.publicKey };
}

export async function loginWithMera() {
  const info = await ensureMeraSession();
  const nonceRes = await fetch(`${API_ORIGIN}/v1/auth/mera/nonce`, { method: "POST" });
  if (!nonceRes.ok) throw new Error("mera_nonce_failed");
  const { nonce } = (await nonceRes.json()) as { nonce: string };
  if (!nonce) throw new Error("mera_nonce_failed");
  const signed = await signMeraPersonalMessage(`superview.fun wants you to sign in\nAddress: ${info.evmAddress}\nNonce: ${nonce}`);
  if (signed.address.toLowerCase() !== info.evmAddress.toLowerCase()) throw new Error("mera_address_mismatch");
  const verify = await fetch(`${API_ORIGIN}/v1/auth/mera/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      nonce,
      address: signed.address,
      signature: signed.signature,
      credentialId: signed.credentialId,
      solanaAddress: signed.solanaAddress
    })
  });
  if (!verify.ok) throw new Error("mera_verify_failed");
  const body = (await verify.json()) as { token: string; handle: string; userId: string };
  setMeraToken(body.token);
  return { ...body, address: signed.address, solanaAddress: signed.solanaAddress };
}
