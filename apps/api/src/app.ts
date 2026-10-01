import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { loadEnv } from "@takeandstake/config";
import { prisma } from "@takeandstake/db";
import { runDryRunInvest } from "./services/paper-invest.js";
import { runLiveInvest } from "./services/live-invest.js";
import { handlePocketChat } from "./services/pocket-chat.js";
import { portfolioFromRun, withDraftPayload } from "./services/portfolio-from-run.js";
import {
  canonicalReceipt,
  verifyReceipt,
  tickMarket,
  listQuotes,
  takeSeries,
  buildLiveBoard,
  computePocketMark,
  asNum,
  syncRobinhoodCatalog,
  filterQuotes,
  QUOTES_CACHE_KEY,
  backingPrivacy,
  sanitizeBacking,
  visibleComments,
  loadTokenCard
} from "@takeandstake/core";
import { fillCompanyAbout } from "@takeandstake/ai";
import { STOCK_TOKEN_COPY, backRequestSchema, backingPrivacySchema, commentSchema, pocketChatSchema, stanceSchema, log, logError } from "@takeandstake/shared";
import { optionalAuth, requireAdmin, requireAuth, requirePocketOwner, requireTakeAuthor, verifyPrivyWebhook } from "./middleware/auth.js";
import { meRouter } from "./routes/me.js";
import { researchRouter } from "./routes/research.js";
import { socialRouter } from "./routes/social.js";
import { streamRouter } from "./routes/stream.js";
import { redis } from "./redis.js";

function pid(req: Request, key: string) {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

const env = loadEnv();
export const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const quiet =
    req.path === "/health" ||
    req.path.startsWith("/v1/quotes") ||
    req.path.startsWith("/v1/stream") ||
    req.path === "/v1/feed";
  if (quiet && req.method === "GET") return next();
  const started = Date.now();
  res.on("finish", () => {
    if (req.method === "GET" && res.statusCode < 400) return;
    log("api", `${req.method} ${req.path}`, { status: res.statusCode, ms: Date.now() - started });
  });
  next();
});
app.use(meRouter);
app.use(researchRouter);
app.use(socialRouter);
app.use(streamRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true, copy: STOCK_TOKEN_COPY });
});

app.get("/v1/flags", async (_req, res) => {
  const flags = await prisma.featureFlag.findMany();
  res.json({ flags });
});

app.get("/v1/catalog", async (_req, res) => {
  const tokens = await prisma.stockToken.findMany({ include: { universe: true } });
  res.json({ tokens, disclaimer: STOCK_TOKEN_COPY });
});

app.post("/v1/catalog/sync", async (_req, res) => {
  try {
    const r = await syncRobinhoodCatalog();
    res.json(r);
  } catch (e) {
    res.status(502).json({ error: "catalog_sync_failed", detail: String(e) });
  }
});

const aboutJobs = new Map<string, Promise<string | null>>();

function kickAboutFill(tokenId: string) {
  if (aboutJobs.has(tokenId)) return;
  const job = fillCompanyAbout(tokenId)
    .catch((e) => {
      logError("api", "token about", e);
      return null;
    })
    .finally(() => aboutJobs.delete(tokenId));
  aboutJobs.set(tokenId, job);
}

app.get("/v1/tokens/:symbol", async (req, res) => {
  const found = await loadTokenCard(pid(req, "symbol"));
  if (!found) return res.status(404).json({ error: "not_found" });
  if (!found.card.about) kickAboutFill(found.tokenId);
  res.json({ ...found.card, filling: !found.card.about });
});

app.get("/v1/quotes", async (req, res) => {
  const symbols = String(req.query.symbols ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    const cached = await redis.get(QUOTES_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as { quotes?: Array<{ symbol: string }>; at?: string };
      const quotes = filterQuotes(parsed.quotes ?? [], symbols.length ? symbols : undefined);
      return res.json({ quotes, at: parsed.at ?? new Date().toISOString() });
    }
  } catch {
    /* fall through */
  }
  const quotes = await listQuotes(symbols.length ? symbols : undefined);
  res.json({ quotes, at: new Date().toISOString() });
});

app.get("/v1/takes/:id/series", async (req, res) => {
  const range = String(req.query.range ?? "1D");
  const points = await takeSeries(pid(req, "id"), range);
  res.json({
    takeId: pid(req, "id"),
    range,
    points: points.map((p) => ({
      asOf: p.asOf instanceof Date ? p.asOf.toISOString() : p.asOf,
      indexValue: p.indexValue,
      benchmarkIndex: p.benchmarkIndex,
      vsSpy: p.vsSpy,
      holdingContributions: p.holdingContributions
    }))
  });
});

app.get("/v1/takes/:id", optionalAuth, async (req, res) => {
  const take = await prisma.take.findUnique({
    where: { id: pid(req, "id") },
    include: {
      author: true,
      management: true,
      revisions: {
        orderBy: { number: "desc" },
        include: {
          target: { include: { holdings: { include: { token: true } } } },
          receipt: true,
          researchRun: { include: { thesis: true, actions: true, candidates: { include: { score: true, token: true } } } }
        }
      },
      comments: { include: { user: true, reactions: true }, orderBy: { createdAt: "asc" } },
      stances: true,
      backings: true,
      valuations: { orderBy: { asOf: "asc" } },
      briefs: { orderBy: { cycle: { startedAt: "desc" } }, take: 3 },
      cycles: { orderBy: { startedAt: "desc" }, take: 8, include: { brief: true, decisions: true, evidence: true, health: true } },
      linksFrom: true,
      linksTo: true,
      decisions: { orderBy: { createdAt: "desc" }, take: 8 }
    }
  });
  if (!take) return res.status(404).json({ error: "not_found" });
  const privacy = backingPrivacy(take.backings, req.user?.id);
  const backings = take.backings.map((b) => sanitizeBacking(b, req.user?.id));
  res.json({
    take: { ...take, backings, comments: visibleComments(take.comments) },
    disclaimer: STOCK_TOKEN_COPY,
    ...privacy
  });
});

app.get("/v1/takes/:id/agent", optionalAuth, async (req, res) => {
  const takeId = pid(req, "id");
  const take = await prisma.take.findUnique({ where: { id: takeId } });
  if (!take) return res.status(404).json({ error: "not_found" });
  const brief = await prisma.dailyBrief.findFirst({
    where: { takeId },
    orderBy: { cycle: { startedAt: "desc" } }
  });
  const decisions = await prisma.agentDecision.findMany({
    where: { takeId },
    orderBy: { createdAt: "desc" },
    take: 8,
    select: { id: true, status: true, reasoning: true, createdAt: true, level: true, proposal: true }
  });
  let proposals: Array<{
    id: string;
    pocketId: string;
    trigger: string;
    trades: unknown;
    estCostUsd: unknown;
    status: string;
    expiresAt: Date;
    createdAt: Date;
    mode: string;
  }> = [];
  if (req.user) {
    const rows = await prisma.rebalanceProposal.findMany({
      where: { status: "PENDING", pocket: { userId: req.user.id, takeId } },
      include: { pocket: { select: { id: true, mode: true } } },
      orderBy: { createdAt: "desc" }
    });
    proposals = rows.map((p) => ({
      id: p.id,
      pocketId: p.pocketId,
      trigger: p.trigger,
      trades: p.trades,
      estCostUsd: p.estCostUsd,
      status: p.status,
      expiresAt: p.expiresAt,
      createdAt: p.createdAt,
      mode: p.pocket.mode
    }));
  }
  res.json({
    brief: brief
      ? {
          summary: brief.summary,
          thesisHealth: brief.thesisHealth,
          whatChanged: brief.whatChanged,
          marketNote: brief.marketNote
        }
      : null,
    decisions,
    proposals
  });
});

app.get("/v1/me/proposals", requireAuth, async (req, res) => {
  const rows = await prisma.rebalanceProposal.findMany({
    where: { status: "PENDING", pocket: { userId: req.user!.id } },
    include: {
      pocket: {
        include: {
          take: { include: { revisions: { orderBy: { number: "desc" }, take: 1 } } }
        }
      }
    },
    orderBy: { createdAt: "desc" }
  });
  res.json({
    proposals: rows.map((p) => ({
      id: p.id,
      pocketId: p.pocketId,
      takeId: p.pocket.takeId,
      sentence: p.pocket.take.revisions[0]?.sentence ?? null,
      mode: p.pocket.mode,
      trigger: p.trigger,
      trades: p.trades,
      estCostUsd: p.estCostUsd,
      expiresAt: p.expiresAt,
      createdAt: p.createdAt
    }))
  });
});

app.post("/v1/takes/:id/publish", requireAuth, async (req, res) => {
  try {
    const owned = await requireTakeAuthor(req.user!.id, pid(req, "id"));
    if (!owned.ok) return res.status(owned.status).json({ error: owned.error });
    const take = owned.take;
    if (take.status === "PUBLISHED" && take.currentRevisionId) {
      const revision = await prisma.takeRevision.findUnique({
        where: { id: take.currentRevisionId },
        include: { receipt: true }
      });
      return res.json({
        revision,
        receipt: revision?.receipt?.sha256,
        alreadyPublished: true
      });
    }
    const run = await prisma.researchRun.findFirst({
      where: { takeId: take.id },
      include: { thesis: true, candidates: { include: { score: true, token: true } } },
      orderBy: { startedAt: "desc" }
    });
    if (!run) return res.status(400).json({ error: "no_research" });
    const draftEv = await prisma.researchEvent.findFirst({
      where: { runId: run.id, stage: "draft" },
      orderBy: { createdAt: "desc" }
    });
    const constructed = portfolioFromRun(withDraftPayload(run, draftEv?.payload));
    if (!constructed.ok) return res.status(422).json(constructed);
    const target = await prisma.portfolioTarget.create({
      data: {
        cashBps: constructed.cashBps,
        holdings: {
          create: constructed.holdings.map((h) => ({
            tokenId: h.tokenId,
            weightBps: h.weightBps,
            actionId: h.actionId,
            rationale: h.rationale || `Exposure to ${h.symbol}`
          }))
        }
      }
    });
    const last = await prisma.takeRevision.count({ where: { takeId: take.id } });
    const canonical = {
      sentence: run.thesis?.normalizedTake,
      holdings: constructed.holdings,
      cashBps: constructed.cashBps
    };
    const receipt = canonicalReceipt(canonical);
    const revision = await prisma.takeRevision.create({
      data: {
        takeId: take.id,
        number: last + 1,
        sentence: run.thesis?.normalizedTake ?? "Untitled take",
        horizon: run.thesis?.horizon,
        falsifier: Array.isArray(run.thesis?.falsifiers)
          ? String((run.thesis?.falsifiers as string[])[0] ?? "")
          : "",
        researchRunId: run.id,
        targetId: target.id,
        origin: "AUTHOR",
        receipt: { create: { canonicalJson: canonical, sha256: receipt.sha256 } }
      }
    });
    await prisma.take.update({
      where: { id: take.id },
      data: { status: "PUBLISHED", currentRevisionId: revision.id }
    });
    await prisma.takeManagement.upsert({
      where: { takeId: take.id },
      update: {},
      create: { takeId: take.id, mode: "AUTO" }
    });
    try {
      const { Queue } = await import("bullmq");
      const q = new Queue("agent", { connection: redis });
      await q.add("memo", { takeId: take.id });
    } catch (e) {
      logError("api", "memo queue", e);
    }
    res.json({ revision, receipt: receipt.sha256 });
  } catch (e) {
    logError("api", "publish failed", e);
    res.status(500).json({ error: "publish_failed", detail: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/v1/takes/:id/back", requireAuth, async (req, res) => {
  try {
  const parsed = backRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const user = req.user!;
  const take = await prisma.take.findUnique({ where: { id: pid(req, "id") } });
  if (!take) return res.status(404).json({ error: "not_found" });
  if (parsed.data.level === "LIVE") {
    const live = await prisma.featureFlag.findUnique({ where: { key: "live_trading" } });
    if (!live?.enabled) return res.status(403).json({ error: "live_trading_disabled" });
    if (user.jurisdictionStatus === "RESTRICTED") return res.status(403).json({ error: "restricted_jurisdiction" });
  }
  const pocket = await prisma.pocket.upsert({
    where: { userId_takeId_mode: { userId: user.id, takeId: take.id, mode: parsed.data.level } },
    update: { status: "ACTIVE" },
    create: { userId: user.id, takeId: take.id, mode: parsed.data.level }
  });
  if (parsed.data.level !== "WATCH") {
    await prisma.mandate.upsert({
      where: { pocketId: pocket.id },
      update: { mode: parsed.data.mandateMode },
      create: {
        pocketId: pocket.id,
        mode: parsed.data.mandateMode,
        cashMinBps: parsed.data.cashMinBps ?? 0,
        cashMaxBps: parsed.data.cashMaxBps ?? 2000,
        maxTurnoverDailyBps: parsed.data.maxTurnoverDailyBps ?? 1000,
        maxTurnoverWeeklyBps: parsed.data.maxTurnoverWeeklyBps ?? 2500,
        allowNewNames: parsed.data.allowNewNames ?? true
      }
    });
    const cash = await prisma.ledgerAccount.upsert({
      where: { pocketId_kind_tokenId: { pocketId: pocket.id, kind: "CASH", tokenId: "USDG" } },
      update: {},
      create: { pocketId: pocket.id, kind: "CASH", tokenId: "USDG" }
    });
    if (parsed.data.level === "DRY_RUN") {
      const already = await prisma.ledgerEntry.count({ where: { accountId: cash.id } });
      if (already === 0) {
        const usd = parsed.data.amountUsd ?? env.PAPER_STARTING_USD;
        const amount = String(Math.round(usd * 1_000_000));
        const tx = await prisma.ledgerTransaction.create({
          data: { pocketId: pocket.id, type: "DEPOSIT" }
        });
        await prisma.ledgerEntry.create({
          data: { transactionId: tx.id, accountId: cash.id, amount, usdValue: usd }
        });
      }
    }
  }
  const backing = await prisma.backing.upsert({
    where: { userId_takeId_level: { userId: user.id, takeId: take.id, level: parsed.data.level } },
    update: {
      pocketId: pocket.id,
      ...(parsed.data.amountUsd != null ? { amountUsd: parsed.data.amountUsd } : {}),
      ...(parsed.data.revealAmount != null ? { revealAmount: parsed.data.revealAmount } : {})
    },
    create: {
      userId: user.id,
      takeId: take.id,
      level: parsed.data.level,
      pocketId: pocket.id,
      amountUsd: parsed.data.amountUsd,
      revealAmount: parsed.data.revealAmount ?? false
    }
  });
  let invest: Awaited<ReturnType<typeof runDryRunInvest>> | Awaited<ReturnType<typeof runLiveInvest>> | undefined;
  if (parsed.data.level === "DRY_RUN") {
    const auto = await prisma.featureFlag.findUnique({ where: { key: "auto_dry_run" } });
    const published = take.status === "PUBLISHED";
    if (auto?.enabled && published) {
      invest = await runDryRunInvest(pocket.id, env);
    }
  }
  if (parsed.data.level === "LIVE") {
    const auto = await prisma.featureFlag.findUnique({ where: { key: "auto_live" } });
    if (auto?.enabled && take.status === "PUBLISHED") {
      invest = await runLiveInvest(pocket.id, env, user.id);
    }
  }
  res.json({ pocket, backing, invest });
  } catch (e) {
    logError("api", "back failed", e);
    res.status(500).json({ error: "back_failed", detail: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/v1/pockets/:id/dry-run-invest", requireAuth, async (req, res) => {
  const owned = await requirePocketOwner(req.user!.id, pid(req, "id"));
  if (!owned.ok) return res.status(owned.status).json({ error: owned.error });
  const result = await runDryRunInvest(pid(req, "id"), env);
  if ("error" in result) {
    const code = result.error;
    return res.status(code === "not_found" ? 404 : 400).json({ error: code });
  }
  res.json(result);
});

app.post("/v1/pockets/:id/live-invest", requireAuth, async (req, res) => {
  const owned = await requirePocketOwner(req.user!.id, pid(req, "id"));
  if (!owned.ok) return res.status(owned.status).json({ error: owned.error });
  const result = await runLiveInvest(pid(req, "id"), env, req.user!.id);
  if ("error" in result) {
    const code = result.error;
    const status = code === "not_found" ? 404 : code === "live_disabled" || code === "paused" ? 403 : 400;
    return res.status(status).json({ error: code });
  }
  res.json(result);
});

app.post("/v1/wallets/:id/grant", requireAuth, async (req, res) => {
  const wallet = await prisma.wallet.findFirst({ where: { id: pid(req, "id"), userId: req.user!.id } });
  if (!wallet) return res.status(404).json({ error: "not_found" });
  const grant = await prisma.signerGrant.create({
    data: {
      walletId: wallet.id,
      privySignerId: String(req.body?.privySignerId ?? "session"),
      allowedContracts: req.body?.allowedContracts ?? [],
      maxPerTxUsd: env.LIVE_MAX_TRADE_USD,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    }
  });
  res.json({ grant });
});

app.get("/v1/pockets", requireAuth, async (req, res) => {
  const user = req.user!;
  const pockets = await prisma.pocket.findMany({
    where: { userId: user.id },
    include: {
      take: {
        include: {
          revisions: {
            take: 1,
            orderBy: { number: "desc" },
            include: { target: { include: { holdings: { include: { token: true } } } } }
          }
        }
      },
      mandate: true,
      valuations: { orderBy: { asOf: "desc" }, take: 1 },
      proposals: { where: { status: "PENDING" } },
      chats: { orderBy: { createdAt: "asc" }, take: 80, include: { user: { select: { handle: true, displayName: true } } } },
      accounts: { include: { entries: true } },
      orders: { orderBy: { createdAt: "desc" }, take: 6, include: { legs: { include: { quotes: true } } } }
    }
  });
  const out = [];
  for (const p of pockets) {
    const mark = await computePocketMark(p.id);
    out.push({
      ...p,
      mark,
      navUsd: mark?.navUsd ?? asNum(p.valuations[0]?.navUsd),
      unrealizedUsd: mark?.unrealizedUsd ?? null,
      vsBook: mark?.vsBook ?? null
    });
  }
  res.json({ pockets: out });
});

app.post("/v1/pockets/:id/mandate", requireAuth, async (req, res) => {
  const owned = await requirePocketOwner(req.user!.id, pid(req, "id"));
  if (!owned.ok) return res.status(owned.status).json({ error: owned.error });
  const mode = req.body?.mode === "AUTO" ? "AUTO" : "APPROVAL";
  const pocket = owned.pocket;
  const mandate = await prisma.mandate.upsert({
    where: { pocketId: pocket.id },
    update: { mode },
    create: { pocketId: pocket.id, mode }
  });
  res.json({ mandate });
});

app.post("/v1/proposals/:id/approve", requireAuth, async (req, res) => {
  const proposal = await prisma.rebalanceProposal.findUnique({
    where: { id: pid(req, "id") },
    include: { pocket: true }
  });
  if (!proposal) return res.status(404).json({ error: "not_found" });
  if (proposal.pocket.userId !== req.user!.id) return res.status(403).json({ error: "forbidden" });
  if (proposal.status !== "PENDING") return res.status(409).json({ error: "not_pending" });
  if (proposal.expiresAt < new Date()) {
    await prisma.rebalanceProposal.update({ where: { id: proposal.id }, data: { status: "EXPIRED" } });
    return res.status(409).json({ error: "expired" });
  }
  if (proposal.pocket.mode === "LIVE") {
    const live = await prisma.featureFlag.findUnique({ where: { key: "live_trading" } });
    if (!live?.enabled) return res.status(403).json({ error: "live_trading_disabled" });
  }
  await prisma.rebalanceProposal.update({ where: { id: proposal.id }, data: { status: "APPROVED" } });
  const order = await prisma.order.create({
    data: {
      pocketId: proposal.pocketId,
      mode: proposal.pocket.mode === "LIVE" ? "LIVE" : "DRY_RUN",
      kind: "REBALANCE",
      status: proposal.pocket.mode === "DRY_RUN" ? "APPROVED" : "PENDING_APPROVAL"
    }
  });
  if (proposal.pocket.mode === "DRY_RUN") {
    await prisma.order.update({ where: { id: order.id }, data: { status: "FILLED" } });
  }
  res.json({ proposalId: proposal.id, status: "APPROVED", orderId: order.id });
});

app.post("/v1/proposals/:id/skip", requireAuth, async (req, res) => {
  const proposal = await prisma.rebalanceProposal.findUnique({
    where: { id: pid(req, "id") },
    include: { pocket: true }
  });
  if (!proposal) return res.status(404).json({ error: "not_found" });
  if (proposal.pocket.userId !== req.user!.id) return res.status(403).json({ error: "forbidden" });
  if (proposal.status !== "PENDING") return res.status(409).json({ error: "not_pending" });
  await prisma.rebalanceProposal.update({ where: { id: proposal.id }, data: { status: "DISMISSED" } });
  res.json({ proposalId: proposal.id, status: "DISMISSED" });
});

app.post("/v1/takes/:id/comments", requireAuth, async (req, res) => {
  const parsed = commentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const user = req.user!;
  if (/buy this now|guaranteed returns/i.test(parsed.data.body)) {
    return res.status(400).json({ error: "moderation_block", detail: "Looks like a pump, not discussion." });
  }
  const take = await prisma.take.findUnique({ where: { id: pid(req, "id") } });
  if (!take) return res.status(404).json({ error: "not_found" });
  const comment = await prisma.comment.create({
    data: {
      takeId: take.id,
      revisionId: take.currentRevisionId,
      userId: user.id,
      kind: parsed.data.kind,
      body: parsed.data.body,
      parentId: parsed.data.parentId,
      sourceUrl: parsed.data.sourceUrl
    }
  });
  if (/\B@agent\b|(^|\s)@agent\b/i.test(parsed.data.body)) {
    try {
      const { Queue } = await import("bullmq");
      const q = new Queue("social", { connection: redis });
      await q.add("reply", { commentId: comment.id });
    } catch (e) {
      logError("api", "queue reply", e);
    }
  }
  res.json({ comment });
});

app.patch("/v1/takes/:id/backing/privacy", requireAuth, async (req, res) => {
  const parsed = backingPrivacySchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const takeId = pid(req, "id");
  const updated = await prisma.backing.updateMany({
    where: { takeId, userId: req.user!.id, level: { in: ["DRY_RUN", "LIVE"] } },
    data: { revealAmount: parsed.data.revealAmount }
  });
  if (!updated.count) return res.status(404).json({ error: "not_found" });
  const backings = await prisma.backing.findMany({ where: { takeId } });
  res.json({ ok: true, revealAmount: parsed.data.revealAmount, ...backingPrivacy(backings, req.user!.id) });
});

app.get("/v1/pockets/:id/chat", requireAuth, async (req, res) => {
  const owned = await requirePocketOwner(req.user!.id, pid(req, "id"));
  if (!owned.ok) return res.status(owned.status).json({ error: owned.error });
  const messages = await prisma.pocketChat.findMany({
    where: { pocketId: owned.pocket.id },
    include: { user: { select: { handle: true, displayName: true } } },
    orderBy: { createdAt: "asc" },
    take: 200
  });
  res.json({ messages });
});

app.post("/v1/pockets/:id/chat", requireAuth, async (req, res) => {
  const parsed = pocketChatSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const owned = await requirePocketOwner(req.user!.id, pid(req, "id"));
  if (!owned.ok) return res.status(owned.status).json({ error: owned.error });
  try {
    const out = await handlePocketChat(owned.pocket.id, req.user!.id, parsed.data.body, env);
    const mandate = await prisma.mandate.findUnique({ where: { pocketId: owned.pocket.id } });
    res.json({ ...out, mandate });
  } catch (e) {
    logError("api", "pocket chat", e);
    res.status(500).json({ error: "chat_failed", detail: e instanceof Error ? e.message : String(e) });
  }
});

app.post("/v1/takes/:id/stance", requireAuth, async (req, res) => {
  const parsed = stanceSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const user = req.user!;
  const row = await prisma.takeStance.upsert({
    where: { takeId_userId: { takeId: pid(req, "id"), userId: user.id } },
    update: { stance: parsed.data.stance },
    create: { takeId: pid(req, "id"), userId: user.id, stance: parsed.data.stance }
  });
  res.json({ stance: row });
});

app.post("/v1/takes/:id/management", requireAuth, async (req, res) => {
  const mode = req.body?.mode === "AUTO" ? "AUTO" : "APPROVAL";
  const row = await prisma.takeManagement.upsert({
    where: { takeId: pid(req, "id") },
    update: { mode },
    create: { takeId: pid(req, "id"), mode }
  });
  res.json({ management: row });
});

app.get("/v1/takes/:id/live", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = async () => {
    const val = await prisma.takeValuation.findFirst({
      where: { takeId: pid(req, "id") },
      orderBy: { asOf: "desc" }
    });
    res.write(`data: ${JSON.stringify({ type: "tick", valuation: val, at: new Date().toISOString() })}\n\n`);
  };
  await send();
  const t = setInterval(() => void send(), 15_000);
  req.on("close", () => clearInterval(t));
});

app.get("/v1/live/board", async (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("Access-Control-Allow-Origin", "*");
  const rpc = env.ALCHEMY_RPC_URL || env.ROBINHOOD_RPC_URL;
  const send = async () => {
    try {
      await tickMarket(rpc);
    } catch (err) {
      logError("api", "tickMarket", err);
    }
    const board = await buildLiveBoard();
    res.write(`data: ${JSON.stringify(board)}\n\n`);
  };
  await send();
  const t = setInterval(() => void send(), 15_000);
  req.on("close", () => clearInterval(t));
});

app.get("/r/:hash", async (req, res) => {
  const receipt = await prisma.takeReceipt.findUnique({
    where: { sha256: pid(req, "hash") },
    include: { revision: { include: { take: true } } }
  });
  if (!receipt) return res.status(404).json({ error: "not_found" });
  res.json({
    receipt,
    verified: verifyReceipt(receipt.canonicalJson, receipt.sha256),
    disclaimer: STOCK_TOKEN_COPY
  });
});

app.get("/v1/receipts/:hash", async (req, res) => {
  const receipt = await prisma.takeReceipt.findUnique({ where: { sha256: pid(req, "hash") } });
  if (!receipt) return res.status(404).json({ error: "not_found" });
  res.json({ receipt, verified: verifyReceipt(receipt.canonicalJson, receipt.sha256) });
});

app.post("/v1/collections", requireAuth, async (req, res) => {
  const user = req.user!;
  const col = await prisma.collection.create({
    data: { ownerId: user.id, title: String(req.body.title ?? "Untitled"), description: String(req.body.description ?? "") }
  });
  res.json({ collection: col });
});

app.post("/v1/collections/:id/items", requireAuth, async (req, res) => {
  const item = await prisma.collectionItem.create({
    data: { collectionId: pid(req, "id"), takeId: String(req.body.takeId), note: req.body.note }
  });
  res.json({ item });
});

app.get("/v1/collections", async (_req, res) => {
  const collections = await prisma.collection.findMany({ include: { items: true, owner: true } });
  res.json({ collections });
});

app.post("/v1/circles", requireAuth, async (req, res) => {
  const user = req.user!;
  const circle = await prisma.circle.create({
    data: {
      name: String(req.body.name ?? "Circle"),
      topic: String(req.body.topic ?? ""),
      createdBy: user.id,
      members: { create: { userId: user.id, role: "AUTHOR" } }
    }
  });
  res.json({ circle });
});

app.get("/v1/circles", async (_req, res) => {
  const circles = await prisma.circle.findMany({ include: { members: true } });
  res.json({ circles });
});

app.post("/v1/takes/:id/counter", requireAuth, async (req, res) => {
  const user = req.user!;
  const original = await prisma.take.findUnique({ where: { id: pid(req, "id") } });
  if (!original) return res.status(404).json({ error: "not_found" });
  const counter = await prisma.take.create({
    data: { authorId: user.id, status: "DRAFT", parentTakeId: original.id }
  });
  await prisma.takeLink.create({
    data: {
      fromTakeId: counter.id,
      toTakeId: original.id,
      type: "COUNTER",
      deltaText: String(req.body.deltaText ?? "They get the mechanism wrong.")
    }
  });
  res.json({ counterTakeId: counter.id });
});

app.get("/v1/me/belief-map", requireAuth, async (req, res) => {
  const user = req.user!;
  const pockets = await prisma.pocket.findMany({
    where: { userId: user.id },
    include: { take: { include: { revisions: { take: 1, orderBy: { number: "desc" }, include: { target: { include: { holdings: { include: { token: true } } } } } } } } }
  });
  const overlap: Record<string, number> = {};
  for (const p of pockets) {
    for (const h of p.take.revisions[0]?.target?.holdings ?? []) {
      overlap[h.token.symbol] = (overlap[h.token.symbol] ?? 0) + h.weightBps;
    }
  }
  res.json({ overlap, pocketCount: pockets.length });
});

app.post("/v1/agent/cycle/:takeId", requireAuth, async (req, res) => {
  const pause = await prisma.featureFlag.findUnique({ where: { key: "pause_agent" } });
  if (pause?.enabled) return res.status(409).json({ error: "agent_paused" });
  const take = await prisma.take.findUnique({ where: { id: pid(req, "takeId") } });
  if (!take) return res.status(404).json({ error: "not_found" });
  try {
    const { Queue } = await import("bullmq");
    const q = new Queue("agent", { connection: redis });
    await q.add("one", { takeId: take.id });
  } catch (e) {
    logError("api", "queue_failed", e);
    return res.status(500).json({ error: "queue_failed" });
  }
  res.json({ queued: true, takeId: take.id });
});

app.post("/webhooks/parallel", async (req, res) => {
  await prisma.webhookDelivery.create({ data: { source: "parallel", payload: req.body ?? {} } });
  res.json({ ok: true });
});
app.post("/webhooks/privy", async (req, res) => {
  const ok = await verifyPrivyWebhook(req);
  if (!ok) return res.status(401).json({ error: "invalid_webhook" });
  await prisma.webhookDelivery.create({ data: { source: "privy", payload: req.body ?? {} } });
  res.json({ ok: true });
});
app.post("/webhooks/alchemy", async (req, res) => {
  await prisma.webhookDelivery.create({ data: { source: "alchemy", payload: req.body ?? {} } });
  res.json({ ok: true });
});

app.get("/v1/admin/flags", requireAdmin, async (_req, res) => {
  res.json({ flags: await prisma.featureFlag.findMany() });
});

app.post("/v1/admin/flags/:key", requireAdmin, async (req, res) => {
  const flag = await prisma.featureFlag.upsert({
    where: { key: pid(req, "key") },
    update: { enabled: Boolean(req.body.enabled) },
    create: { key: pid(req, "key"), enabled: Boolean(req.body.enabled) }
  });
  res.json({ flag });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logError("api", "unhandled", err);
  res.status(500).json({ error: "internal", detail: err.message });
});

export function start() {
  process.on("unhandledRejection", (err) => {
    logError("api", "unhandledRejection", err);
  });
  const rpc = env.ALCHEMY_RPC_URL || env.ROBINHOOD_RPC_URL;
  const pulse = () => void tickMarket(rpc).catch((err) => logError("api", "tickMarket", err));
  pulse();
  setInterval(pulse, 15_000);
  app.listen(env.API_PORT, () => {
    log("api", "listening", { port: env.API_PORT, mode: env.APP_MODE });
  });
}
