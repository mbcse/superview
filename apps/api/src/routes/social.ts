import { Router } from "express";
import { Queue } from "bullmq";
import { prisma } from "@takeandstake/db";
import { serializeFeedTake, asNum, backingPrivacy, threadComments, windowExcessVsSpy, rangeSince } from "@takeandstake/core";
import { commentSchema, stanceSchema } from "@takeandstake/shared";
import { optionalAuth, requireAuth } from "../middleware/auth.js";
import { canViewTake, requirePublishedTake } from "../take-access.js";
import { redis } from "../redis.js";

const socialQueue = new Queue("social", { connection: redis });

function pid(req: { params: Record<string, string | string[] | undefined> }, key: string) {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

export const socialRouter = Router();

socialRouter.get("/v1/feed", optionalAuth, async (req, res) => {
  const tab = String(req.query.tab ?? "for-you");
  const q = String(req.query.q ?? "").trim();
  const followSet = new Set<string>();
  if (req.user) {
    const follows = await prisma.follow.findMany({
      where: { followerId: req.user.id, targetType: "USER" },
      select: { targetId: true }
    });
    for (const f of follows) followSet.add(f.targetId);
  }
  let authorFilter: { authorId?: { in: string[] } } = {};
  if (tab === "following" && req.user) {
    authorFilter = { authorId: { in: [...followSet] } };
  }
  const searchFilter = q
    ? {
        OR: [
          { revisions: { some: { sentence: { contains: q, mode: "insensitive" as const } } } },
          { author: { handle: { contains: q, mode: "insensitive" as const } } },
          { author: { displayName: { contains: q, mode: "insensitive" as const } } },
          {
            revisions: {
              some: {
                target: { holdings: { some: { token: { symbol: { contains: q, mode: "insensitive" as const } } } } }
              }
            }
          }
        ]
      }
    : {};
  const takes = await prisma.take.findMany({
    where: { status: "PUBLISHED", visibility: "PUBLIC", ...authorFilter, ...searchFilter },
    include: {
      author: true,
      revisions: {
        orderBy: { number: "desc" },
        take: 1,
        include: { target: { include: { holdings: { include: { token: true } } } } }
      },
      valuations: { orderBy: { asOf: "desc" }, take: 2 },
      backings: true,
      stances: true,
      linksTo: true,
      _count: { select: { comments: { where: { status: "VISIBLE" } } } }
    },
    orderBy: tab === "trending" ? { createdAt: "desc" } : { createdAt: "desc" },
    take: 50
  });
  const rows = takes.map((t) => ({
    ...serializeFeedTake(t, req.user?.id),
    comments: t._count.comments,
    forks: t.linksTo.filter((l) => l.type === "FORK").length,
    avatar: t.author.avatar,
    displayName: t.author.displayName,
    authorId: t.authorId,
    createdAt: t.createdAt,
    following: followSet.has(t.authorId),
    mine: req.user?.id === t.authorId
  }));
  if (tab === "leaderboard" || tab === "trending") {
    rows.sort((a, b) => (b.vsSpy ?? -Infinity) - (a.vsSpy ?? -Infinity));
  }
  res.json({ takes: rows, tab });
});

socialRouter.get("/v1/leaderboard", optionalAuth, async (req, res) => {
  const period = String(req.query.period ?? "1M");
  const q = String(req.query.q ?? "").trim();
  const searchFilter = q
    ? {
        OR: [
          { revisions: { some: { sentence: { contains: q, mode: "insensitive" as const } } } },
          { author: { handle: { contains: q, mode: "insensitive" as const } } },
          { author: { displayName: { contains: q, mode: "insensitive" as const } } },
          {
            revisions: {
              some: {
                target: { holdings: { some: { token: { symbol: { contains: q, mode: "insensitive" as const } } } } }
              }
            }
          }
        ]
      }
    : {};
  const takes = await prisma.take.findMany({
    where: { status: "PUBLISHED", visibility: { in: ["PUBLIC", "UNLISTED"] }, ...searchFilter },
    include: {
      author: true,
      revisions: { orderBy: { number: "desc" }, take: 1, include: { target: { include: { holdings: { include: { token: true } } } } } },
      valuations: { orderBy: { asOf: "desc" }, take: 2 },
      backings: true,
      stances: true,
      linksTo: true
    },
    take: 80
  });
  const since = rangeSince(period);
  const windowMarks = await Promise.all(
    takes.map(async (t) => {
      const last = await prisma.takeValuation.findFirst({ where: { takeId: t.id }, orderBy: { asOf: "desc" } });
      const first = await prisma.takeValuation.findFirst({
        where: { takeId: t.id, ...(since ? { asOf: { gte: since } } : {}) },
        orderBy: { asOf: "asc" }
      });
      return { id: t.id, rows: [first, last].flatMap((r) => (r ? [r] : [])) };
    })
  );
  const marksById = new Map(windowMarks.map((m) => [m.id, m.rows]));
  const ranked = takes
    .map((t) => {
      const row = serializeFeedTake(t, req.user?.id);
      const excess = windowExcessVsSpy(marksById.get(t.id) ?? [], period);
      return { ...row, vsSpy: excess, periodRanked: excess != null };
    })
    .sort((a, b) => {
      if (a.periodRanked !== b.periodRanked) return a.periodRanked ? -1 : 1;
      return (b.vsSpy ?? -Infinity) - (a.vsSpy ?? -Infinity);
    });
  res.json({ period, takes: ranked });
});

socialRouter.get("/v1/takes/:id/thread", optionalAuth, async (req, res) => {
  const id = pid(req, "id");
  const take = await prisma.take.findUnique({
    where: { id },
    include: {
      author: true,
      revisions: {
        orderBy: { number: "desc" },
        take: 1,
        include: {
          target: { include: { holdings: { include: { token: true } } } },
          researchRun: { include: { thesis: true, actions: true, candidates: { include: { score: true, token: true } } } },
          receipt: true
        }
      },
      comments: { include: { user: true, reactions: true, replies: { include: { user: true } } }, orderBy: { createdAt: "asc" } },
      backings: true,
      stances: true,
      valuations: { orderBy: { asOf: "asc" }, take: 400 },
      decisions: { orderBy: { createdAt: "desc" }, take: 20 }
    }
  });
  if (!take || !canViewTake(take, req.user?.id)) return res.status(404).json({ error: "not_found" });
  const privacy = backingPrivacy(take.backings, req.user?.id);
  res.json({ take: { ...take, comments: threadComments(take.comments) }, vsSpy: asNum(take.valuations.at(-1)?.indexValue), ...privacy });
});

socialRouter.get("/v1/takes/:id/comments", optionalAuth, async (req, res) => {
  const id = pid(req, "id");
  const take = await prisma.take.findUnique({
    where: { id },
    select: { id: true, authorId: true, status: true, visibility: true }
  });
  if (!take || !canViewTake(take, req.user?.id)) return res.status(404).json({ error: "not_found" });
  const rows = await prisma.comment.findMany({
    where: { takeId: id, status: "VISIBLE" },
    include: {
      user: { select: { id: true, handle: true, displayName: true, avatar: true } },
      reactions: true
    },
    orderBy: { createdAt: "asc" }
  });
  const comments = threadComments(rows)
    .map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt,
      parentId: c.parentId,
      authorType: c.authorType,
      kind: c.kind,
      user: c.user,
      isAuthor: Boolean(c.userId && c.userId === take.authorId),
      reactions: c.reactions.length
    }));
  res.json({ comments, authorId: take.authorId });
});

socialRouter.post("/v1/takes/:id/fork", requireAuth, async (req, res) => {
  const access = await requirePublishedTake(pid(req, "id"), req.user!.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const original = await prisma.take.findUnique({
    where: { id: access.take.id },
    include: { revisions: { orderBy: { number: "desc" }, take: 1 } }
  });
  if (!original) return res.status(404).json({ error: "not_found" });
  const fork = await prisma.take.create({ data: { authorId: req.user!.id, status: "DRAFT" } });
  await prisma.takeRevision.create({
    data: {
      takeId: fork.id,
      number: 1,
      sentence: original.revisions[0]?.sentence ?? "Copied view",
      origin: "AUTHOR"
    }
  });
  await prisma.takeLink.create({
    data: { fromTakeId: fork.id, toTakeId: original.id, type: "FORK", deltaText: "Copied this view" }
  });
  res.json({ forkTakeId: fork.id });
});

socialRouter.post("/v1/comments/:id/react", requireAuth, async (req, res) => {
  const type = String(req.body?.type ?? "USEFUL");
  if (!["AGREE", "DISAGREE", "USEFUL"].includes(type)) return res.status(400).json({ error: "bad_type" });
  const row = await prisma.commentReaction.upsert({
    where: { commentId_userId_type: { commentId: pid(req, "id"), userId: req.user!.id, type: type as "AGREE" } },
    update: {},
    create: { commentId: pid(req, "id"), userId: req.user!.id, type: type as "AGREE" }
  });
  res.json({ reaction: row });
});

socialRouter.post("/v1/comments/:id/reply-agent", requireAuth, async (req, res) => {
  await socialQueue.add("reply", { commentId: pid(req, "id") });
  res.json({ queued: true });
});

socialRouter.get("/v1/notifications", requireAuth, async (req, res) => {
  const rows = await prisma.notification.findMany({
    where: { userId: req.user!.id },
    orderBy: { createdAt: "desc" },
    take: 50
  });
  res.json({ notifications: rows });
});

socialRouter.post("/v1/notifications/:id/read", requireAuth, async (req, res) => {
  const row = await prisma.notification.updateMany({
    where: { id: pid(req, "id"), userId: req.user!.id },
    data: { readAt: new Date() }
  });
  res.json({ updated: row.count });
});

socialRouter.post("/v1/users/:id/follow", requireAuth, async (req, res) => {
  const targetId = pid(req, "id");
  if (!targetId || targetId === req.user!.id) return res.status(400).json({ error: "self" });
  const follow = await prisma.follow.upsert({
    where: {
      followerId_targetType_targetId: {
        followerId: req.user!.id,
        targetType: "USER",
        targetId
      }
    },
    update: {},
    create: { followerId: req.user!.id, targetType: "USER", targetId }
  });
  res.json({ follow });
});

socialRouter.delete("/v1/users/:id/follow", requireAuth, async (req, res) => {
  await prisma.follow.deleteMany({
    where: { followerId: req.user!.id, targetType: "USER", targetId: pid(req, "id") }
  });
  res.json({ ok: true });
});

socialRouter.post("/v1/takes/:id/stance", requireAuth, async (req, res) => {
  const parsed = stanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const access = await requirePublishedTake(pid(req, "id"), req.user!.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const row = await prisma.takeStance.upsert({
    where: { takeId_userId: { takeId: access.take.id, userId: req.user!.id } },
    update: { stance: parsed.data.stance },
    create: { takeId: access.take.id, userId: req.user!.id, stance: parsed.data.stance }
  });
  res.json({ stance: row });
});

void commentSchema;
