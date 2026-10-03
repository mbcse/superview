import type { NextFunction, Request, Response } from "express";
import { PrivyClient } from "@privy-io/server-auth";
import { loadEnv } from "@takeandstake/config";
import { prisma } from "@takeandstake/db";
import { handleFromPrivyId } from "../auth-handle.js";

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
    const accounts = Array.isArray((user as { linkedAccounts?: unknown }).linkedAccounts)
      ? (user as { linkedAccounts: Array<Record<string, unknown>> }).linkedAccounts
      : [];
    const wallets = accounts.filter((a) => a.type === "wallet" || a.type === "smart_wallet");
    const hit = address
      ? wallets.find((w) => String(w.address ?? "").toLowerCase() === address.toLowerCase())
      : wallets[0];
    return typeof hit?.id === "string" ? hit.id : undefined;
  } catch {
    return undefined;
  }
}

export async function upsertPrivyUser(
  privyId: string,
  extras?: { displayName?: string; walletAddress?: string; privyWalletId?: string }
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
  if (extras?.walletAddress && /^0x[0-9a-fA-F]{40}$/.test(extras.walletAddress)) {
    const privyWalletId = (await lookupPrivyWalletId(privyId, extras.walletAddress)) ?? extras.privyWalletId;
    await prisma.wallet.upsert({
      where: { address_chainId: { address: extras.walletAddress, chainId: 4663 } },
      update: {
        userId: user.id,
        isPrimary: true,
        ...(privyWalletId ? { privyWalletId } : {})
      },
      create: {
        userId: user.id,
        address: extras.walletAddress,
        type: "EMBEDDED",
        chainId: 4663,
        isPrimary: true,
        privyWalletId
      }
    });
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
  } catch {
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

export async function verifyPrivyWebhook(req: Request) {
  const sdk = client();
  if (!sdk) return true;
  const signature = req.header("svix-signature") ?? req.header("privy-signature") ?? "";
  if (!signature) return false;
  return true;
}
