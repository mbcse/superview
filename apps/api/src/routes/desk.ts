import { Router } from "express";
import { prisma } from "@takeandstake/db";
import { loadEnv } from "@takeandstake/config";
import { USDG_MAINNET } from "@takeandstake/chain";
import { optionalAuth, requireAuth, requirePocketOwner } from "../middleware/auth.js";
import { readUsdgBalance } from "../services/live-invest.js";

function pid(req: { params: Record<string, string | string[] | undefined> }, key: string) {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

const env = loadEnv();
export const deskRouter = Router();

deskRouter.get("/v1/wallet", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { wallets: { include: { signerGrants: true } } }
  });
  const wallet = user?.wallets.find((w) => w.isPrimary) ?? user?.wallets[0];
  const live = await prisma.featureFlag.findUnique({ where: { key: "live_trading" } });
  let usdg: { usd: number } | null = null;
  if (wallet) {
    try {
      usdg = await readUsdgBalance(env, wallet.address);
    } catch {
      usdg = null;
    }
  }
  const grant = wallet?.signerGrants.find((g) => !g.revokedAt && g.expiresAt > new Date()) ?? null;
  const pending = wallet
    ? await prisma.chainTx.findMany({
        where: { status: "SUBMITTED", leg: { order: { pocket: { userId: req.user!.id } } } },
        take: 8,
        orderBy: { id: "desc" }
      })
    : [];
  res.json({
    wallet,
    usdgUsd: usdg?.usd ?? null,
    liveEnabled: Boolean(live?.enabled && env.APP_MODE === "live"),
    grant,
    pending
  });
});

deskRouter.get("/v1/orders/:id", requireAuth, async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: pid(req, "id") },
    include: {
      pocket: true,
      legs: { include: { quotes: true, txs: true } }
    }
  });
  if (!order) return res.status(404).json({ error: "not_found" });
  if (order.pocket.userId !== req.user!.id) return res.status(403).json({ error: "forbidden" });
  const tokenIds = [...new Set(order.legs.map((l) => l.tokenId))];
  const tokens = await prisma.stockToken.findMany({ where: { id: { in: tokenIds } } });
  const byId = new Map(tokens.map((t) => [t.id, t]));
  res.json({
    order: {
      ...order,
      legs: order.legs.map((l) => ({
        ...l,
        symbol: byId.get(l.tokenId)?.symbol ?? l.tokenId
      }))
    }
  });
});

deskRouter.get("/v1/circles/:id", optionalAuth, async (req, res) => {
  const circle = await prisma.circle.findUnique({
    where: { id: pid(req, "id") },
    include: {
      members: { include: { user: { select: { id: true, handle: true, displayName: true } } } },
      takes: {
        where: { status: "PUBLISHED" },
        include: {
          author: true,
          revisions: { orderBy: { number: "desc" }, take: 1 }
        }
      }
    }
  });
  if (!circle) return res.status(404).json({ error: "not_found" });
  const member = req.user ? circle.members.some((m) => m.userId === req.user!.id) : false;
  if (circle.visibility === "PRIVATE" && !member) return res.status(403).json({ error: "forbidden" });
  res.json({ circle, member });
});

deskRouter.post("/v1/circles/:id/join", requireAuth, async (req, res) => {
  const circle = await prisma.circle.findUnique({
    where: { id: pid(req, "id") },
    include: { members: true }
  });
  if (!circle) return res.status(404).json({ error: "not_found" });
  if (circle.members.length >= 12) return res.status(409).json({ error: "full" });
  const row = await prisma.circleMember.upsert({
    where: { circleId_userId: { circleId: circle.id, userId: req.user!.id } },
    update: {},
    create: { circleId: circle.id, userId: req.user!.id, role: "MEMBER" }
  });
  res.json({ member: row });
});

deskRouter.post("/v1/circles/:id/leave", requireAuth, async (req, res) => {
  await prisma.circleMember.deleteMany({
    where: { circleId: pid(req, "id"), userId: req.user!.id }
  });
  res.json({ ok: true });
});

deskRouter.post("/v1/circles/:id/takes", requireAuth, async (req, res) => {
  const circleId = pid(req, "id");
  const member = await prisma.circleMember.findUnique({
    where: { circleId_userId: { circleId, userId: req.user!.id } }
  });
  if (!member) return res.status(403).json({ error: "forbidden" });
  const takeId = String(req.body?.takeId ?? "");
  const take = await prisma.take.findUnique({ where: { id: takeId } });
  if (!take || take.authorId !== req.user!.id) return res.status(404).json({ error: "not_found" });
  const updated = await prisma.take.update({ where: { id: takeId }, data: { circleId } });
  res.json({ take: updated });
});

deskRouter.get("/v1/collections/:id", optionalAuth, async (req, res) => {
  const collection = await prisma.collection.findUnique({
    where: { id: pid(req, "id") },
    include: {
      owner: { select: { handle: true, displayName: true } },
      items: {
        include: {
          take: {
            include: {
              author: true,
              revisions: { orderBy: { number: "desc" }, take: 1, include: { target: { include: { holdings: { include: { token: true } } } } } },
              valuations: { orderBy: { asOf: "desc" }, take: 2 }
            }
          }
        },
        orderBy: { order: "asc" }
      },
      follows: true
    }
  });
  if (!collection) return res.status(404).json({ error: "not_found" });
  const mine = req.user?.id === collection.ownerId;
  if (collection.visibility === "PRIVATE" && !mine) return res.status(403).json({ error: "forbidden" });
  res.json({
    collection,
    following: req.user ? collection.follows.some((f) => f.userId === req.user!.id) : false
  });
});

deskRouter.post("/v1/collections/:id/follow", requireAuth, async (req, res) => {
  const follow = await prisma.collectionFollow.upsert({
    where: { collectionId_userId: { collectionId: pid(req, "id"), userId: req.user!.id } },
    update: {},
    create: { collectionId: pid(req, "id"), userId: req.user!.id }
  });
  res.json({ follow });
});

void USDG_MAINNET;
void requirePocketOwner;
