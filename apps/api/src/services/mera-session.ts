import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { getAddress, verifyMessage } from "@takeandstake/chain";
import { loadEnv } from "@takeandstake/config";
import { prisma } from "@takeandstake/db";
import { isSolanaPubkey } from "@takeandstake/markets";
import { BASE_CHAIN_ID, MONAD_CHAIN_ID, ROBINHOOD_CHAIN_ID, SOLANA_CHAIN_ID } from "@takeandstake/shared";
import type { Redis } from "ioredis";

const memoryNonces = new Map<string, number>();
const NONCE_TTL_SEC = 300;

export function sessionSecret(env = loadEnv()) {
  if (env.NODE_ENV === "production") {
    if (!env.SESSION_JWT_SECRET || env.SESSION_JWT_SECRET.length < 32) {
      throw new Error("SESSION_JWT_SECRET required");
    }
    return env.SESSION_JWT_SECRET;
  }
  return env.SESSION_JWT_SECRET || env.ADMIN_TOKEN || "dev-mera-session";
}

export function meraMessage(nonce: string, address: string) {
  return `superview.fun wants you to sign in\nAddress: ${address}\nNonce: ${nonce}`;
}

export function signMeraSession(userId: string, secret = sessionSecret()) {
  const payload = Buffer.from(JSON.stringify({ sub: userId, exp: Date.now() + 7 * 24 * 60 * 60 * 1000 })).toString(
    "base64url"
  );
  const sig = createHmac("sha256", secret).update(payload).digest("base64url");
  return `mera.${payload}.${sig}`;
}

export function readMeraSession(token: string, secret = sessionSecret()): string | null {
  if (!token.startsWith("mera.")) return null;
  const parts = token.slice(5).split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;
  if (!payload || !sig) return null;
  const expect = createHmac("sha256", secret).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const body = JSON.parse(Buffer.from(payload, "base64url").toString()) as { sub?: string; exp?: number };
    if (!body.sub || !body.exp || body.exp < Date.now()) return null;
    return body.sub;
  } catch {
    return null;
  }
}

export async function issueMeraNonce(redis?: Redis | null) {
  const nonce = randomBytes(16).toString("hex");
  if (redis) {
    await redis.set(`mera:nonce:${nonce}`, "1", "EX", NONCE_TTL_SEC);
    return nonce;
  }
  if (loadEnv().NODE_ENV === "production") throw new Error("redis_required");
  memoryNonces.set(nonce, Date.now() + NONCE_TTL_SEC * 1000);
  return nonce;
}

export async function consumeNonce(nonce: string, redis?: Redis | null) {
  if (!/^[a-f0-9]{32}$/.test(nonce)) return false;
  if (redis) {
    const key = `mera:nonce:${nonce}`;
    const hit = await redis.getdel(key);
    return hit === "1";
  }
  if (loadEnv().NODE_ENV === "production") return false;
  const exp = memoryNonces.get(nonce);
  memoryNonces.delete(nonce);
  return Boolean(exp && exp > Date.now());
}

export function normalizeEvmAddress(address: string) {
  return getAddress(address);
}

export async function verifyMeraLogin(
  opts: {
    nonce: string;
    address: string;
    signature: `0x${string}`;
    credentialId: string;
    solanaAddress?: string;
  },
  redis?: Redis | null
) {
  if (!opts.credentialId || opts.credentialId.length < 16) throw new Error("bad_credential");
  const address = normalizeEvmAddress(opts.address);
  if (opts.solanaAddress && !isSolanaPubkey(opts.solanaAddress)) throw new Error("bad_solana_address");
  if (!(await consumeNonce(opts.nonce, redis))) throw new Error("bad_nonce");
  const ok = await verifyMessage({
    address,
    message: meraMessage(opts.nonce, address),
    signature: opts.signature
  });
  if (!ok) throw new Error("bad_signature");
  const handle = `mera${opts.credentialId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 10).toLowerCase()}`;
  const user = await prisma.user.upsert({
    where: { meraCredentialId: opts.credentialId },
    update: { authProvider: "MERA" },
    create: {
      authProvider: "MERA",
      meraCredentialId: opts.credentialId,
      handle,
      displayName: handle,
      country: "SG",
      jurisdictionStatus: "ALLOWED"
    }
  });
  const evmChains = [MONAD_CHAIN_ID, BASE_CHAIN_ID, ROBINHOOD_CHAIN_ID];
  for (const chainId of evmChains) {
    await prisma.wallet.upsert({
      where: { address_chainId: { address: address.toLowerCase(), chainId } },
      update: { userId: user.id, provider: "MERA" },
      create: {
        userId: user.id,
        address: address.toLowerCase(),
        chainId,
        provider: "MERA",
        type: "EMBEDDED",
        isPrimary: chainId === MONAD_CHAIN_ID
      }
    });
  }
  if (opts.solanaAddress) {
    await prisma.wallet.upsert({
      where: { address_chainId: { address: opts.solanaAddress, chainId: SOLANA_CHAIN_ID } },
      update: { userId: user.id, provider: "MERA" },
      create: {
        userId: user.id,
        address: opts.solanaAddress,
        chainId: SOLANA_CHAIN_ID,
        provider: "MERA",
        type: "EMBEDDED",
        isPrimary: false
      }
    });
  }
  return { user, token: signMeraSession(user.id) };
}
