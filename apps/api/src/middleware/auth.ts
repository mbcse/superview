import type { NextFunction, Request, Response } from "express";
import { PrivyClient } from "@privy-io/server-auth";
import { loadEnv } from "@takeandstake/config";
import { prisma } from "@takeandstake/db";
import { handleFromPrivyId } from "../auth-handle.js";
import { assertWalletAssignable, isHexAddress, verifiedWalletId } from "../wallet-bind.js";
import { verifySharedSecret, verifySvixSignature } from "../webhook-auth.js";

const env = loadEnv();

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        privyId: string;
        handle: string;
        displayName: string;
        jurisdictionStatus: string;
      };
    }
  }
}

let privy: PrivyClient | null = null;
function client() {
  if (!env.PRIVY_APP_ID || !env.PRIVY_APP_SECRET) return null;
  if (!privy) privy = new PrivyClient(env.PRIVY_APP_ID, env.PRIVY_APP_SECRET);
  return privy;
}

function demoAllowed() {
  if (process.env.ALLOW_DEMO_USER === "false") return false;
  if (process.env.ALLOW_DEMO_USER === "true") return true;
  return env.NODE_ENV !== "production";
}

async function lookupPrivyWalletId(privyId: string, address?: string) {
  const sdk = client();
  if (!sdk) return undefined;
  try {
    const user = await sdk.getUser(privyId);
    const accounts = Array.isArray(user.linkedAccounts) ? user.linkedAccounts : [];
    const wallets = accounts.filter((a) => a.type === "wallet" || a.type === "smart_wallet");
    const hit = address
      ? wallets.find((w) => String(w.address ?? "").toLowerCase() === address.toLowerCase())
      : wallets[0];
    const id = hit && typeof (hit as { id?: unknown }).id === "string" ? (hit as { id: string }).id : undefined;
    return id;
  } catch {
    return undefined;
  }
}

export class WalletBindError extends Error {
  status: number;
  code: string;
  constructor(code: "wallet_bound" | "wallet_mismatch" | "unverified_wallet", status = 409) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

export async function upsertPrivyUser(
  privyId: string,
  extras?: { displayName?: string; walletAddress?: string }
) {
  const existing = await prisma.user.findUnique({ where: { privyId } });
  const user =
    existing ??
    (await prisma.user.create({
      data: {
        privyId,
        handle: handleFromPrivyId(privyId),
        displayName: extras?.displayName ?? "Member",
        jurisdictionStatus: "UNKNOWN"
      }
    }));
  if (extras?.displayName && extras.displayName !== user.displayName) {
    await prisma.user.update({ where: { id: user.id }, data: { displayName: extras.displayName } });
  }
  if (extras?.walletAddress && isHexAddress(extras.walletAddress)) {
    const privyWalletId = verifiedWalletId(await lookupPrivyWalletId(privyId, extras.walletAddress));
    if (!privyWalletId) throw new WalletBindError("unverified_wallet", 400);
    const row = await prisma.wallet.findUnique({
      where: { address_chainId: { address: extras.walletAddress, chainId: 4663 } }
    });
    const allowed = assertWalletAssignable(row, user.id, privyWalletId);
    if (!allowed.ok) throw new WalletBindError(allowed.error);
    if (row) {
      await prisma.wallet.update({
        where: { id: row.id },
        data: { privyWalletId, isPrimary: true }
      });
    } else {
      await prisma.wallet.create({
        data: {
          userId: user.id,
          address: extras.walletAddress,
          type: "EMBEDDED",
          chainId: 4663,
          isPrimary: true,
          privyWalletId
        }
      });
    }
  }
  return prisma.user.findUniqueOrThrow({ where: { id: user.id }, include: { wallets: true } });
}

export async function resolveUser(req: Request) {
  const auth = req.header("authorization");
  const q = req.query?.token;
  const fromQuery = Array.isArray(q) ? q[0] : q;
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : typeof fromQuery === "string" ? fromQuery : "";
  const sdk = client();
  if (token && sdk) {
    try {
      const verified = await sdk.verifyAuthToken(token);
      return upsertPrivyUser(verified.userId);
    } catch {
      if (!demoAllowed()) return null;
    }
  }
  if (demoAllowed()) {
    const handle = (req.header("x-demo-user") ?? "demo").replace(/[^a-z0-9_-]/gi, "") || "demo";
    return prisma.user.upsert({
      where: { handle },
      update: {},
      create: {
        privyId: `did:privy:${handle}`,
        handle,
        displayName: handle,
        country: "SG",
        jurisdictionStatus: "ALLOWED"
      },
      include: { wallets: true }
    });
  }
  return null;
}

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await resolveUser(req);
    if (user) req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  try {
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: "unauthorized" });
    req.user = user;
    next();
  } catch (err) {
    if (err instanceof WalletBindError) return res.status(err.status).json({ error: err.code });
    return res.status(401).json({ error: "invalid_token" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.header("x-admin-token") !== env.ADMIN_TOKEN) {
    return res.status(403).json({ error: "forbidden" });
  }
  next();
}

export async function requirePocketOwner(userId: string, pocketId: string) {
  const pocket = await prisma.pocket.findUnique({ where: { id: pocketId } });
  if (!pocket) return { ok: false as const, error: "not_found", status: 404 as const };
  if (pocket.userId !== userId) return { ok: false as const, error: "forbidden", status: 403 as const };
  return { ok: true as const, pocket };
}

export async function requireTakeAuthor(userId: string, takeId: string) {
  const take = await prisma.take.findUnique({ where: { id: takeId } });
  if (!take) return { ok: false as const, error: "not_found", status: 404 as const };
  if (take.authorId !== userId) return { ok: false as const, error: "forbidden", status: 403 as const };
  return { ok: true as const, take };
}

export async function verifyPrivyWebhook(req: Request, rawBody?: string) {
  return verifySvixSignature({
    secret: process.env.PRIVY_WEBHOOK_SECRET ?? "",
    id: req.header("svix-id") ?? "",
    timestamp: req.header("svix-timestamp") ?? "",
    signatureHeader: req.header("svix-signature") ?? req.header("privy-signature") ?? "",
    body: rawBody ?? JSON.stringify(req.body ?? {})
  });
}

export function verifyAlchemyWebhook(req: Request) {
  return verifySharedSecret(req.header("x-alchemy-token") ?? "", process.env.ALCHEMY_WEBHOOK_TOKEN);
}
