import { Router } from "express";
import { Queue } from "bullmq";
import { prisma } from "@takeandstake/db";
import { takeSentenceSchema, log, parseChainId, parseWorld, deskOf } from "@takeandstake/shared";
import { loadEnv } from "@takeandstake/config";
import { requireAuth, requireTakeAuthor } from "../middleware/auth.js";
import { createRedis, dropRedis, redis } from "../redis.js";
import { hitRateLimit, LIMIT_RESEARCH } from "../rate-limit.js";
import { portfolioFromRun, withDraftPayload } from "../services/portfolio-from-run.js";

const researchQueue = new Queue("research", { connection: redis });
const agentQueue = new Queue("agent", { connection: redis });
const env = loadEnv();

function isAdmin(req: { header: (n: string) => string | undefined }) {
  return req.header("x-admin-token") === env.ADMIN_TOKEN;
}

export const researchRouter = Router();

researchRouter.post("/v1/research", requireAuth, async (req, res) => {
  if (!(await hitRateLimit(redis, `research:${req.user!.id}`, LIMIT_RESEARCH.max, LIMIT_RESEARCH.windowMs))) {
    return res.status(429).json({ error: "rate_limited" });
  }
  const parsed = takeSentenceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const world = parseWorld(parsed.data.world);
  const chainId = parseChainId(parsed.data.chainId, world);
  const desk = deskOf(world, chainId);
  if (!desk) return res.status(400).json({ error: "bad_desk" });
  const lens = parsed.data.lens === "SKY" ? "SKY" : "BELIEF";
  const chart = (parsed.data.chart ?? "").trim() || undefined;
  const astrologySystem = lens === "SKY" ? parsed.data.astrologySystem === "VEDIC" ? "VEDIC" : "WESTERN" : undefined;
  const sentence =
    (parsed.data.sentence ?? "").trim() ||
    (chart ? chart.split(/\n/).map((l) => l.trim()).find(Boolean)?.slice(0, 220) ?? "Sky view" : "");
  const parentTakeId = parsed.data.parentTakeId;
  if (parentTakeId) {
    const parent = await prisma.take.findUnique({ where: { id: parentTakeId } });
    if (parent && (parent.world !== world || parent.chainId !== chainId)) {
      return res.status(400).json({ error: "desk_mismatch" });
    }
  }
  const take = await prisma.take.create({
    data: {
      authorId: req.user!.id,
      status: "DRAFT",
      world,
      chainId,
      lens,
      astrologySystem,
      parentTakeId: parentTakeId || undefined
    }
  });
  if (parentTakeId) {
    await prisma.takeLink.create({
      data: { fromTakeId: take.id, toTakeId: parentTakeId, type: "FORK", deltaText: sentence }
    }).catch(() => {});
  }
  await prisma.takeRevision.create({
    data: {
      takeId: take.id,
      number: 1,
      sentence,
      astrologyChart: chart,
      origin: "AUTHOR"
    }
  });
  const prior =
    lens === "SKY"
      ? null
      : await prisma.thesisSpec.findFirst({
          where: {
            normalizedTake: { equals: sentence, mode: "insensitive" },
            refuse: false,
            run: { world, chainId }
          },
          include: { run: { include: { events: { orderBy: { createdAt: "desc" }, take: 8 } } } }
        });
  const reusable =
    prior?.run && (prior.run.status === "DRAFT" || prior.run.status === "DEEP_DONE") ? prior.run : null;
  const run = await prisma.researchRun.create({
    data: {
      takeId: take.id,
      world,
      chainId,
      status: reusable ? "DRAFT" : "PENDING",
      stage: reusable ? "draft" : "queued",
      modelVersions: reusable?.modelVersions ?? {
        view: sentence,
        world,
        chainId,
        lens,
        astrologySystem,
        chart,
        skyHeadlineProvided: Boolean((parsed.data.sentence ?? "").trim())
      },
      finishedAt: reusable ? new Date() : undefined
    }
  });
  if (reusable) {
    const draft = reusable.events.find((e) => e.stage === "draft");
    await prisma.researchEvent.create({
      data: {
        runId: run.id,
        stage: "draft",
        message: "Reused staged thesis",
        ...(draft?.payload != null ? { payload: draft.payload } : {})
      }
    });
    if (prior && !prior.refuse) {
      await prisma.thesisSpec.create({
        data: {
          runId: run.id,
          normalizedTake: prior.normalizedTake,
          interpretation: prior.interpretation,
          mechanism: prior.mechanism,
          horizon: prior.horizon,
          assumptions: prior.assumptions ?? undefined,
          falsifiers: prior.falsifiers ?? undefined,
          questions: prior.questions ?? undefined,
          refuse: false
        }
      });
    }
    log("api", "research reused", { run: run.id, view: sentence });
    return res.json({ takeId: take.id, runId: run.id, status: run.status, reused: true });
  }
  await prisma.researchEvent.create({
    data: { runId: run.id, stage: "queued", message: "Queued for research" }
  });
  await researchQueue.add("run", { runId: run.id }, {
    jobId: run.id,
    attempts: 6,
    backoff: { type: "exponential", delay: 15_000 }
  });
  log("api", "research queued", { run: run.id, view: sentence, lens });
  res.json({ takeId: take.id, runId: run.id, status: run.status });
});

researchRouter.get("/v1/research/:runId", requireAuth, async (req, res) => {
  const run = await prisma.researchRun.findUnique({
    where: { id: String(req.params.runId) },
    include: {
      thesis: true,
      actions: true,
      take: { select: { authorId: true } },
      events: { orderBy: { createdAt: "asc" } },
      candidates: { include: { score: true, token: true } }
    }
  });
  if (!run) return res.status(404).json({ error: "not_found" });
  if (run.take && run.take.authorId !== req.user!.id && !isAdmin(req)) {
    return res.status(403).json({ error: "forbidden" });
  }
  const draft = [...run.events].reverse().find((e) => e.stage === "draft");
  const constructed = portfolioFromRun(withDraftPayload(run, draft?.payload));
  res.json({ run, portfolio: constructed, spec: run.thesis });
});

researchRouter.get("/v1/research/:runId/stream", requireAuth, async (req, res) => {
  const runId = String(req.params.runId);
  const owned = await prisma.researchRun.findUnique({
    where: { id: runId },
    include: { take: { select: { authorId: true } } }
  });
  if (!owned) return res.status(404).json({ error: "not_found" });
  if (owned.take && owned.take.authorId !== req.user!.id && !isAdmin(req)) {
    return res.status(403).json({ error: "forbidden" });
  }
  res.setHeader("content-type", "text/event-stream");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("connection", "keep-alive");
  const send = (data: unknown) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const existing = await prisma.researchEvent.findMany({ where: { runId }, orderBy: { createdAt: "asc" } });
  for (const e of existing) send({ stage: e.stage, message: e.message, payload: e.payload, at: e.createdAt });
  const sub = createRedis();
  await sub.subscribe(`research:${runId}`);
  sub.on("message", (_ch: string, message: string) => {
    try {
      send(JSON.parse(message));
    } catch {
      send({ message });
    }
  });
  const timer = setInterval(async () => {
    const run = await prisma.researchRun.findUnique({ where: { id: runId } });
    if (!run) return;
    if (run.status === "DRAFT" || run.status === "FAILED" || run.status === "DEEP_DONE") {
      send({ stage: "done", status: run.status });
      clearInterval(timer);
      dropRedis(sub);
      res.end();
    }
  }, 2000);
  req.on("close", () => {
    clearInterval(timer);
    dropRedis(sub);
  });
});

researchRouter.post("/v1/research/:runId/draft", requireAuth, async (req, res) => {
  const run = await prisma.researchRun.findUnique({
    where: { id: String(req.params.runId) },
    include: {
      thesis: true,
      take: { select: { authorId: true } },
      events: { orderBy: { createdAt: "asc" } },
      candidates: { include: { score: true, token: true } }
    }
  });
  if (!run) return res.status(404).json({ error: "not_found" });
  if (run.take && run.take.authorId !== req.user!.id && !isAdmin(req)) {
    return res.status(403).json({ error: "forbidden" });
  }
  if (run.status !== "DRAFT" && run.status !== "DEEP_DONE") {
    return res.status(202).json({ pending: true, status: run.status, stage: run.stage });
  }
  const draft = [...run.events].reverse().find((e) => e.stage === "draft");
  res.json({ draft: true, portfolio: portfolioFromRun(withDraftPayload(run, draft?.payload)), run });
});

researchRouter.post("/v1/takes/:id/memo", requireAuth, async (req, res) => {
  const owned = await requireTakeAuthor(req.user!.id, String(req.params.id ?? ""));
  if (!owned.ok) return res.status(owned.status).json({ error: owned.error });
  await agentQueue.add("memo", { takeId: owned.take.id });
  res.json({ queued: true });
});

