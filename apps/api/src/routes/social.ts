import { Router } from "express";
import { Queue } from "bullmq";
import { prisma } from "@takeandstake/db";
import { serializeFeedTake, asNum, backingPrivacy, isInfraCommentBody, visibleComments } from "@takeandstake/core";
import { commentSchema, stanceSchema } from "@takeandstake/shared";
import { optionalAuth, requireAuth, requireTakeAuthor } from "../middleware/auth.js";
import { redis } from "../redis.js";

const socialQueue = new Queue("social", { connection: redis });

function pid(req: { params: Record<string, string | string[] | undefined> }, key: string) {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

export const socialRouter = Router();

socialRouter.get("/v1/feed", optionalAuth, async (req, res) => {
  await prisma.comment.updateMany({
    where: { status: "VISIBLE", body: { contains: "invalid token" } },
    data: { status: "HIDDEN" }
  });
  const tab = String(req.query.tab ?? "for-you");
  let authorFilter: { authorId?: { in: string[] } } = {};
  if (tab === "following" && req.user) {
    const follows = await prisma.follow.findMany({
      where: { followerId: req.user.id, targetType: "USER" },
      select: { targetId: true }
    });
    authorFilter = { authorId: { in: follows.map((f) => f.targetId) } };
  }
  const takes = await prisma.take.findMany({
    where: { status: "PUBLISHED", visibility: { in: ["PUBLIC", "UNLISTED"] }, ...authorFilter },
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
    createdAt: t.createdAt
  }));
  if (tab === "leaderboard" || tab === "trending") {
    rows.sort((a, b) => (b.vsSpy ?? -Infinity) - (a.vsSpy ?? -Infinity));
  }
  res.json({ takes: rows, tab });
});

socialRouter.get("/v1/leaderboard", optionalAuth, async (req, res) => {
  const period = String(req.query.period ?? "1M");
  void period;
  const takes = await prisma.take.findMany({
    where: { status: "PUBLISHED" },
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
  const ranked = takes
    .map((t) => serializeFeedTake(t, req.user?.id))
    .filter((t) => (t.backers ?? 0) >= 0)
    .sort((a, b) => (b.vsSpy ?? -999) - (a.vsSpy ?? -999));
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
  if (!take) return res.status(404).json({ error: "not_found" });
  const privacy = backingPrivacy(take.backings, req.user?.id);
  res.json({ take: { ...take, comments: visibleComments(take.comments) }, vsSpy: asNum(take.valuations.at(-1)?.indexValue), ...privacy });
});

socialRouter.get("/v1/takes/:id/comments", optionalAuth, async (req, res) => {
  const id = pid(req, "id");
  const take = await prisma.take.findUnique({ where: { id }, select: { id: true, authorId: true } });
  if (!take) return res.status(404).json({ error: "not_found" });
  const rows = await prisma.comment.findMany({
    where: { takeId: id, status: "VISIBLE" },
    include: {
      user: { select: { id: true, handle: true, displayName: true, avatar: true } },
      reactions: true
    },
    orderBy: { createdAt: "asc" }
  });
  const junk = rows.filter((c) => isInfraCommentBody(c.body)).map((c) => c.id);
  if (junk.length) {
    await prisma.comment.updateMany({ where: { id: { in: junk } }, data: { status: "HIDDEN" } });
  }
  const comments = visibleComments(rows)
    .filter((c) => !junk.includes(c.id))
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
  const original = await prisma.take.findUnique({
    where: { id: pid(req, "id") },
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
  const follow = await prisma.follow.upsert({
    where: {
      followerId_targetType_targetId: {
        followerId: req.user!.id,
        targetType: "USER",
        targetId: pid(req, "id")
      }
    },
    update: {},
    create: { followerId: req.user!.id, targetType: "USER", targetId: pid(req, "id") }
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
  const row = await prisma.takeStance.upsert({
    where: { takeId_userId: { takeId: pid(req, "id"), userId: req.user!.id } },
    update: { stance: parsed.data.stance },
    create: { takeId: pid(req, "id"), userId: req.user!.id, stance: parsed.data.stance }
  });
  res.json({ stance: row });
});

void commentSchema;
void requireTakeAuthor;
