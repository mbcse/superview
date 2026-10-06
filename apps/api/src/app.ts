import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import helmet from "helmet";
import { loadEnv } from "@takeandstake/config";
import { parseWorld, parseChainId, cashTokenId, DESKS, isMintOrContract, sourceRestricted } from "@takeandstake/shared";
import { syncBagsCatalog, syncJupiterMemeCatalog, syncXStocksCatalog } from "@takeandstake/markets";
import { prisma } from "@takeandstake/db";
import { depositPaperUsd, executePaperRebalance, runDryRunInvest, withdrawPaperUsd } from "./services/paper-invest.js";
import { runLiveInvest } from "./services/live-invest.js";
import { handlePocketChat } from "./services/pocket-chat.js";
import { portfolioFromRun, withDraftPayload } from "./services/portfolio-from-run.js";
import { fillCompanyAbout, enrichStale } from "@takeandstake/ai";
import {
  canonicalReceipt,
  verifyReceipt,
  listQuotes,
  takeSeries,
  buildLiveBoard,
  computePocketMark,
  asNum,
  syncRobinhoodCatalog,
  syncCorporateActions,
  filterQuotes,
  quoteHasSymbol,
  inheritAliasChg,
  attachDayChange,
  QUOTES_CACHE_KEY,
  QUOTES_ASSET_KEY,
  backingPrivacy,
  sanitizeBacking,
  visibleComments,
  loadTokenCard
} from "@takeandstake/core";
import { refreshChainlistRpcs } from "@takeandstake/chain";
import { STOCK_TOKEN_COPY, backRequestSchema, backingPrivacySchema, commentSchema, pocketChatSchema, log, logError } from "@takeandstake/shared";
import { optionalAuth, requireAdmin, requireAuth, requirePocketOwner, requireTakeAuthor, verifyAlchemyWebhook, verifyPrivyWebhook } from "./middleware/auth.js";
import { canViewTake, loadViewableTake, requirePublishedTake } from "./take-access.js";
import { liveGrantContracts } from "./wallet-bind.js";
import { USDG_MAINNET } from "@takeandstake/chain";
import { meRouter } from "./routes/me.js";
import { researchRouter } from "./routes/research.js";
import { socialRouter } from "./routes/social.js";
import { deskRouter } from "./routes/desk.js";
import { streamRouter } from "./routes/stream.js";
import { redis } from "./redis.js";
import { hitRateLimit, LIMIT_INVEST, LIMIT_WITHDRAW } from "./rate-limit.js";

function pid(req: Request, key: string) {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] ?? "" : v ?? "";
}

function webOrigins(primary: string) {
  const allowed = new Set<string>();
  for (const raw of primary.split(",")) {
    const origin = raw.trim().replace(/\/$/, "");
    if (!origin) continue;
    allowed.add(origin);
    try {
      const url = new URL(origin);
      const host = url.hostname.startsWith("www.") ? url.hostname.slice(4) : url.hostname;
      const port = url.port ? `:${url.port}` : "";
      allowed.add(`${url.protocol}//${host}${port}`);
      allowed.add(`${url.protocol}//www.${host}${port}`);
    } catch {
      /* keep the raw origin */
    }
  }
  return [...allowed];
}

const env = loadEnv();
export const app = express();
app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: webOrigins(env.WEB_ORIGIN), credentials: true }));
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
app.use(deskRouter);
app.use(streamRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true, copy: STOCK_TOKEN_COPY });
});

app.get("/v1/flags", async (_req, res) => {
  const flags = await prisma.featureFlag.findMany();
  res.json({ flags });
});

app.get("/v1/worlds", async (_req, res) => {
  const flags = await prisma.featureFlag.findMany();
  const on = (k: string) => Boolean(flags.find((f) => f.key === k)?.enabled);
  res.json({
    desks: DESKS.map((d) => ({
      ...d,
      live:
        d.live &&
        (d.world === "MEMES"
          ? d.chainId === 4663
            ? on("live_rh_bags")
            : on("live_trading_memes")
          : d.chainId === 101
            ? on("live_trading_xstocks")
            : on("live_trading"))
    }))
  });
});

app.get("/v1/assets/:id", async (req, res) => {
  const token = await prisma.stockToken.findUnique({
    where: { id: pid(req, "id") },
    include: { universe: true }
  });
  if (!token) return res.status(404).json({ error: "not_found" });
  res.json({
    id: token.id,
    symbol: token.symbol,
    name: token.name,
    chainId: token.chainId,
    world: token.world,
    source: token.source,
    venue: token.venue,
    decimals: token.decimals,
    contractAddress: token.contractAddress,
    logoUrl: token.logoUrl,
    liquidityUsd: token.liquidityUsd,
    launchedAt: token.launchedAt,
    riskFlags: token.riskFlags,
    universe: token.universe
  });
});

app.get("/v1/assets/by-address/:chainId/:address", async (req, res) => {
  const chainId = Number(pid(req, "chainId"));
  const address = pid(req, "address");
  const token = await prisma.stockToken.findUnique({
    where: { chainId_contractAddress: { chainId, contractAddress: address } },
    include: { universe: true }
  });
  if (!token) return res.status(404).json({ error: "not_found" });
  res.redirect(302, `/v1/assets/${token.id}`);
});

app.get("/v1/catalog", async (req, res) => {
  const world = parseWorld(req.query.world);
  const chainId = req.query.chainId != null ? parseChainId(req.query.chainId, world) : undefined;
  const source = req.query.source ? String(req.query.source).toUpperCase() : undefined;
  const venue = req.query.venue ? String(req.query.venue).toUpperCase() : undefined;
  const q = String(req.query.q ?? "").trim();
  const minLiquidity = Number(req.query.minLiquidity ?? 0);
  const cursor = req.query.cursor ? String(req.query.cursor) : undefined;
  const tokens = await prisma.stockToken.findMany({
    where: {
      world,
      status: "ACTIVE",
      ...(chainId ? { chainId } : {}),
      ...(source ? { source: source as never } : {}),
      ...(venue ? { venue: venue as never } : {}),
      ...(q
        ? {
            OR: [
              { symbol: { contains: q, mode: "insensitive" } },
              { name: { contains: q, mode: "insensitive" } },
              { contractAddress: { contains: q } }
            ]
          }
        : {}),
      ...(minLiquidity > 0 ? { liquidityUsd: { gte: minLiquidity } } : {})
    },
    include: { universe: true },
    orderBy: { id: "asc" },
    take: 200,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {})
  });
  const visible = tokens.filter((t) => !(t.riskFlags as { isSus?: boolean } | null)?.isSus);
  const rows = visible.map((t) => ({
    id: t.id,
    symbol: t.symbol,
    name: t.name,
    chainId: t.chainId,
    world: t.world,
    source: t.source,
    venue: t.venue,
    decimals: t.decimals,
    contractAddress: t.contractAddress,
    logoUrl: t.logoUrl,
    liquidityUsd: t.liquidityUsd,
    universe: t.universe,
    companyKey: t.universe?.isin || t.universe?.legalName || t.name
  }));
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = world === "STOCKS" ? String(row.companyKey ?? row.symbol) : row.id;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }
  res.json({
    tokens: rows,
    listings: [...groups.values()].map((list) => ({
      name: list[0]?.name,
      listings: list.map((t) => ({
        id: t.id,
        symbol: t.symbol,
        chainId: t.chainId,
        source: t.source,
        contractAddress: t.contractAddress
      }))
    })),
    nextCursor: rows.at(-1)?.id ?? null,
    disclaimer: STOCK_TOKEN_COPY
  });
});

app.post("/v1/catalog/sync", requireAdmin, async (_req, res) => {
  try {
    const r = await syncRobinhoodCatalog();
    const xstocks = await syncXStocksCatalog().catch((e) => ({ error: String(e) }));
    const bags = await syncBagsCatalog().catch((e) => ({ error: String(e) }));
    const memes = await syncJupiterMemeCatalog().catch((e) => ({ error: String(e) }));
    const actions = await syncCorporateActions().catch((e) => ({ error: String(e) }));
    const enrich = await enrichStale(12);
    res.json({ ...r, xstocks, bags, memes, actions, enrich });
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
  const actions = await prisma.corporateAction.findMany({
    where: { tokenId: found.tokenId },
    orderBy: { processDate: "desc" },
    take: 8
  });
  res.json({ ...found.card, filling: !found.card.about, actions });
});

app.get("/v1/quotes", async (req, res) => {
  const symbols = String(req.query.ids ?? req.query.symbols ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  let quotes: Array<{ symbol: string; tokenId?: string; last?: number | null; chgPct?: number | null }> = [];
  let at = new Date().toISOString();
  const ids = symbols.filter((s) => s.length > 16 && !s.includes(" "));
  if (ids.length) {
    try {
      const rows = await redis.hmget(QUOTES_ASSET_KEY, ...ids);
      for (const row of rows) {
        if (!row) continue;
        const q = JSON.parse(row) as { symbol: string; tokenId?: string; last?: number | null; chgPct?: number | null };
        quotes.push(q);
      }
    } catch {
      /* fall through */
    }
  }
  try {
    const cached = await redis.get(QUOTES_CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached) as { quotes?: Array<{ symbol: string; tokenId?: string; last?: number | null; chgPct?: number | null }>; at?: string };
      const extra = filterQuotes(parsed.quotes ?? [], symbols.length ? symbols : undefined);
      const seen = new Set(quotes.map((q) => String(q.tokenId ?? q.symbol).toUpperCase()));
      for (const q of extra) {
        const key = String(q.tokenId ?? q.symbol).toUpperCase();
        if (!seen.has(key)) quotes.push(q);
      }
      at = parsed.at ?? at;
    }
  } catch {
    /* fall through */
  }
  const missing = symbols.filter((s) => !quoteHasSymbol(quotes, s) && !quotes.some((q) => String(q.tokenId ?? "").toUpperCase() === s.toUpperCase()));
  if (!quotes.length || missing.length) {
    const extra = await listQuotes(missing.length ? missing : symbols.length ? symbols : undefined);
    const seen = new Set(quotes.map((q) => String(q.tokenId ?? q.symbol).toUpperCase()));
    for (const q of extra) {
      const key = String(q.tokenId ?? q.symbol).toUpperCase();
      if (!seen.has(key)) quotes.push(q);
    }
  }
  res.json({ quotes: await attachDayChange(inheritAliasChg(quotes)), at });
});

app.get("/v1/takes/:id/series", optionalAuth, async (req, res) => {
  const access = await loadViewableTake(pid(req, "id"), req.user?.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const range = String(req.query.range ?? "1D");
  const points = await takeSeries(access.take.id, range);
  res.json({
    takeId: access.take.id,
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
  if (!take || !canViewTake(take, req.user?.id)) return res.status(404).json({ error: "not_found" });
  const privacy = backingPrivacy(take.backings, req.user?.id);
  const backings = take.backings.map((b) => sanitizeBacking(b, req.user?.id));
  const mine = req.user?.id === take.authorId;
  const following =
    Boolean(req.user) && !mine
      ? Boolean(
          await prisma.follow.findUnique({
            where: {
              followerId_targetType_targetId: {
                followerId: req.user!.id,
                targetType: "USER",
                targetId: take.authorId
              }
            }
          })
        )
      : false;
  const author = {
    id: take.author.id,
    handle: take.author.handle,
    displayName: take.author.displayName,
    avatar: take.author.avatar
  };
  res.json({
    take: { ...take, author, backings, comments: visibleComments(take.comments) },
    disclaimer: STOCK_TOKEN_COPY,
    following,
    mine,
    ...privacy
  });
});

app.get("/v1/takes/:id/agent", optionalAuth, async (req, res) => {
  const takeId = pid(req, "id");
  const take = await prisma.take.findUnique({ where: { id: takeId } });
  if (!take || !canViewTake(take, req.user?.id)) return res.status(404).json({ error: "not_found" });
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
    const priorRev = await prisma.takeRevision.findFirst({
      where: { takeId: take.id },
      orderBy: { number: "desc" }
    });
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
        astrologyChart: priorRev?.astrologyChart,
        horizon: run.thesis?.horizon,
        falsifier: Array.isArray(run.thesis?.falsifiers)
          ? String((run.thesis?.falsifiers as string[])[0] ?? "")
          : "",
        researchRunId: run.id,
        targetId: target.id,
        origin: "AUTHOR",
        receipt: { create: { canonicalJson: JSON.parse(JSON.stringify(canonical)), sha256: receipt.sha256 } }
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

async function enqueueLiveOrder(opts: {
  pocketId: string;
  userId: string;
  amountUsd?: number;
  idempotencyKey: string;
  kind?: "INVEST" | "WITHDRAW";
  to?: string;
}) {
  const existing = await prisma.order.findUnique({ where: { idempotencyKey: opts.idempotencyKey } });
  if (existing) return { orderId: existing.id, status: existing.status, queued: true, idempotent: true };
  const order = await prisma.order.create({
    data: {
      pocketId: opts.pocketId,
      mode: "LIVE",
      kind: opts.kind === "WITHDRAW" ? "EXIT" : "INVEST",
      status: "SUBMITTING",
      idempotencyKey: opts.idempotencyKey
    }
  });
  const { Queue } = await import("bullmq");
  const q = new Queue("execution", { connection: redis });
  await q.add(
    opts.kind === "WITHDRAW" ? "live-withdraw" : "live-invest",
    { ...opts, orderId: order.id },
    { jobId: opts.idempotencyKey, attempts: 3, backoff: { type: "exponential", delay: 8_000 } }
  );
  return { orderId: order.id, queued: true, status: "SUBMITTING" as const };
}

app.post("/v1/takes/:id/invest", requireAuth, async (req, res) => {
  const access = await requirePublishedTake(pid(req, "id"), req.user!.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const mode = String(req.body?.mode ?? "paper").toLowerCase();
  const amountUsd = Number(req.body?.amountUsd);
  const idempotencyKey = String(req.body?.idempotencyKey ?? `inv:${access.take.id}:${req.user!.id}:${Date.now()}`);
  const pocketMode = mode === "live" ? "LIVE" : "DRY_RUN";
  const pocket = await prisma.pocket.findFirst({
    where: { userId: req.user!.id, takeId: access.take.id, mode: pocketMode }
  });
  if (!pocket) return res.status(404).json({ error: "no_pocket" });
  if (pocketMode === "DRY_RUN") {
    if (Number.isFinite(amountUsd) && amountUsd > 0) await depositPaperUsd(pocket.id, amountUsd);
    const result = await runDryRunInvest(pocket.id, env);
    return res.json(result);
  }
  if (!(await hitRateLimit(redis, `invest:${req.user!.id}`, LIMIT_INVEST.max, LIMIT_INVEST.windowMs))) {
    return res.status(429).json({ error: "rate_limited" });
  }
  res.json(await enqueueLiveOrder({ pocketId: pocket.id, userId: req.user!.id, amountUsd, idempotencyKey }));
});

app.post("/v1/takes/:id/back", requireAuth, async (req, res) => {
  try {
  const parsed = backRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const user = req.user!;
  const access = await requirePublishedTake(pid(req, "id"), user.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const take = access.take;
  if (parsed.data.level === "LIVE") {
    const flagKey =
      take.world === "MEMES"
        ? take.chainId === 4663
          ? "live_rh_bags"
          : "live_trading_memes"
        : take.chainId === 101
          ? "live_trading_xstocks"
          : "live_trading";
    const live = await prisma.featureFlag.findUnique({ where: { key: flagKey } });
    if (!live?.enabled) return res.status(403).json({ error: "live_trading_disabled" });
    if (user.jurisdictionStatus === "RESTRICTED") return res.status(403).json({ error: "restricted_jurisdiction" });
    const source =
      take.world === "MEMES" ? "MEMES" : take.chainId === 101 ? "XSTOCKS" : "ROBINHOOD";
    const profile = await prisma.user.findUnique({
      where: { id: user.id },
      select: { country: true, memesRiskAckAt: true }
    });
    if (sourceRestricted(source, profile?.country)) return res.status(403).json({ error: "restricted_jurisdiction" });
    if (take.world === "MEMES" && !profile?.memesRiskAckAt) return res.status(403).json({ error: "memes_ack_required" });
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
        mode: take.world === "MEMES" && parsed.data.level === "LIVE" ? "APPROVAL" : parsed.data.mandateMode,
        cashMinBps: parsed.data.cashMinBps ?? 0,
        cashMaxBps: parsed.data.cashMaxBps ?? 2000,
        maxTurnoverDailyBps: parsed.data.maxTurnoverDailyBps ?? 1000,
        maxTurnoverWeeklyBps: parsed.data.maxTurnoverWeeklyBps ?? 2500,
        allowNewNames: parsed.data.allowNewNames ?? true
      }
    });
    const cashId = cashTokenId(take.world ?? "STOCKS", take.chainId ?? 4663);
    const cash = await prisma.ledgerAccount.upsert({
      where: { pocketId_kind_tokenId: { pocketId: pocket.id, kind: "CASH", tokenId: cashId } },
      update: {},
      create: { pocketId: pocket.id, kind: "CASH", tokenId: cashId }
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

app.post("/v1/pockets/:id/deposit", requireAuth, async (req, res) => {
  const owned = await requirePocketOwner(req.user!.id, pid(req, "id"));
  if (!owned.ok) return res.status(owned.status).json({ error: owned.error });
  if (owned.pocket.mode === "LIVE") return res.status(409).json({ error: "use_live_wallet" });
  const result = await depositPaperUsd(owned.pocket.id, Number(req.body?.amountUsd));
  if ("error" in result) return res.status(400).json({ error: result.error });
  res.json({ ...result, kind: "paper" });
});

app.post("/v1/pockets/:id/withdraw", requireAuth, async (req, res) => {
  const owned = await requirePocketOwner(req.user!.id, pid(req, "id"));
  if (!owned.ok) return res.status(owned.status).json({ error: owned.error });
  if (owned.pocket.mode === "LIVE") return res.status(409).json({ error: "live_withdraw_disabled" });
  const result = await withdrawPaperUsd(owned.pocket.id, Number(req.body?.amountUsd));
  if ("error" in result) {
    return res.status(result.error === "insufficient_cash" ? 409 : 400).json({ error: result.error });
  }
  res.json({ ...result, kind: "paper" });
});

app.post("/v1/pockets/:id/live-invest", requireAuth, async (req, res) => {
  const owned = await requirePocketOwner(req.user!.id, pid(req, "id"));
  if (!owned.ok) return res.status(owned.status).json({ error: owned.error });
  const amountUsd = Number(req.body?.amountUsd);
  const idempotencyKey = String(req.body?.idempotencyKey ?? `live:${owned.pocket.id}:${Date.now()}`);
  if (!(await hitRateLimit(redis, `invest:${req.user!.id}`, LIMIT_INVEST.max, LIMIT_INVEST.windowMs))) {
    return res.status(429).json({ error: "rate_limited" });
  }
  res.json(
    await enqueueLiveOrder({
      pocketId: owned.pocket.id,
      userId: req.user!.id,
      amountUsd: Number.isFinite(amountUsd) && amountUsd > 0 ? amountUsd : undefined,
      idempotencyKey
    })
  );
});

app.post("/v1/me/memes-ack", requireAuth, async (req, res) => {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: { memesRiskAckAt: new Date() }
  });
  res.json({ ok: true });
});

app.get("/v1/media/token", async (req, res) => {
  const src = String(req.query.src ?? "");
  let host = "";
  try {
    host = new URL(src).hostname;
  } catch {
    return res.status(400).json({ error: "bad_url" });
  }
  const allow = /(jup\.ag|bags\.fm|ipfs\.io|arweave\.net|cloudfront\.net|xstocks|backed\.fi|dexscreener|robinhood)\.?/i;
  if (!allow.test(host)) return res.status(400).json({ error: "blocked_host" });
  const remote = await fetch(src, {
    headers: {
      accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      "user-agent": "Mozilla/5.0 (compatible; SuperView/1.0)"
    }
  }).catch(() => null);
  if (!remote?.ok) return res.status(502).json({ error: "fetch_failed" });
  const type = remote.headers.get("content-type") ?? "";
  if (!type.startsWith("image/")) return res.status(415).json({ error: "not_image" });
  const announced = Number(remote.headers.get("content-length") ?? 0);
  if (announced > 2_000_000) return res.status(413).json({ error: "too_large" });
  const buf = Buffer.from(await remote.arrayBuffer());
  if (buf.length > 2_000_000) return res.status(413).json({ error: "too_large" });
  res.setHeader("content-type", type);
  res.setHeader("cache-control", "public, max-age=86400");
  res.setHeader("cross-origin-resource-policy", "cross-origin");
  res.send(buf);
});

app.post("/v1/wallets/:id/grant", requireAuth, async (req, res) => {
  const wallet = await prisma.wallet.findFirst({ where: { id: pid(req, "id"), userId: req.user!.id } });
  if (!wallet) return res.status(404).json({ error: "not_found" });
  if (!wallet.privyWalletId) return res.status(400).json({ error: "no_privy_wallet" });
  const privySignerId = wallet.privyWalletId;
  const contracts = liveGrantContracts(req.body?.allowedContracts, env.LIVE_ALLOWED_CONTRACTS, USDG_MAINNET);
  const grant = await prisma.$transaction(async (tx) => {
    await tx.signerGrant.updateMany({
      where: { walletId: wallet.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    return tx.signerGrant.create({
      data: {
        walletId: wallet.id,
        privySignerId,
        allowedContracts: contracts,
        maxPerTxUsd: env.LIVE_MAX_TRADE_USD,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      }
    });
  });
  res.json({ grant });
});

app.post("/v1/wallets/solana/link", requireAuth, async (req, res) => {
  const address = String(req.body?.address ?? "");
  const privyWalletId = String(req.body?.privyWalletId ?? "") || undefined;
  if (!isMintOrContract(address, 101)) return res.status(400).json({ error: "bad_solana_address" });
  const wallet = await prisma.wallet.upsert({
    where: { address_chainId: { address, chainId: 101 } },
    update: { userId: req.user!.id, privyWalletId, isPrimary: false },
    create: { userId: req.user!.id, address, chainId: 101, privyWalletId, isPrimary: false, type: "EMBEDDED" }
  });
  res.json({ wallet: { id: wallet.id, address: wallet.address, chainId: wallet.chainId } });
});

app.post("/v1/wallets/solana/withdraw", requireAuth, async (req, res) => {
  const to = String(req.body?.to ?? "");
  const amountUsd = Number(req.body?.amountUsd);
  if (!isMintOrContract(to, 101)) return res.status(400).json({ error: "bad_solana_address" });
  if (!(amountUsd > 0)) return res.status(400).json({ error: "bad_amount" });
  const pocket = await prisma.pocket.findFirst({
    where: { userId: req.user!.id, mode: "LIVE", take: { chainId: 101 } },
    orderBy: { createdAt: "desc" }
  });
  if (!pocket) return res.status(404).json({ error: "no_solana_pocket" });
  const idempotencyKey = String(req.body?.idempotencyKey ?? `wd:${req.user!.id}:${Math.round(amountUsd * 100)}:${to}`);
  if (!(await hitRateLimit(redis, `withdraw:${req.user!.id}`, LIMIT_WITHDRAW.max, LIMIT_WITHDRAW.windowMs))) {
    return res.status(429).json({ error: "rate_limited" });
  }
  res.json(await enqueueLiveOrder({ pocketId: pocket.id, userId: req.user!.id, amountUsd, idempotencyKey, kind: "WITHDRAW", to }));
});

app.get("/v1/pockets", requireAuth, async (req, res) => {
  const user = req.user!;
  const world = req.query.world ? parseWorld(req.query.world) : undefined;
  const pockets = await prisma.pocket.findMany({
    where: { userId: user.id, ...(world ? { take: { world } } : {}) },
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
    include: {
      pocket: {
        include: {
          take: {
            include: {
              revisions: {
                orderBy: { number: "desc" },
                take: 1,
                include: { target: { include: { holdings: true } } }
              }
            }
          }
        }
      }
    }
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
    return res.status(409).json({ error: "live_rebalance_uses_live_invest" });
  }
  const trades = proposal.trades as { weights?: Array<{ tokenId: string; weightBps: number; rationale?: string }>; cashBps?: number };
  const weights =
    trades?.weights ??
    proposal.pocket.take.revisions[0]?.target?.holdings.map((h) => ({
      tokenId: h.tokenId,
      weightBps: h.weightBps
    })) ??
    [];
  if (!weights.length) return res.status(400).json({ error: "no_weights" });
  const result = await executePaperRebalance(proposal.pocketId, env, weights, {
    proposalId: proposal.id,
    cashBps: trades?.cashBps,
    changeSummary: "Approved rebalance"
  });
  if ("error" in result) return res.status(400).json({ error: result.error });
  await prisma.rebalanceProposal.update({
    where: { id: proposal.id },
    data: { status: "APPROVED" }
  });
  res.json({ proposalId: proposal.id, status: "APPROVED", orderId: result.orderId, targetId: result.targetId });
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
  const access = await requirePublishedTake(pid(req, "id"), user.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const take = access.take;
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

app.post("/v1/takes/:id/management", requireAuth, async (req, res) => {
  const owned = await requireTakeAuthor(req.user!.id, pid(req, "id"));
  if (!owned.ok) return res.status(owned.status).json({ error: owned.error });
  const mode = req.body?.mode === "AUTO" ? "AUTO" : "APPROVAL";
  const row = await prisma.takeManagement.upsert({
    where: { takeId: owned.take.id },
    update: { mode },
    create: { takeId: owned.take.id, mode }
  });
  res.json({ management: row });
});

app.get("/v1/takes/:id/live", optionalAuth, async (req, res) => {
  const access = await loadViewableTake(pid(req, "id"), req.user?.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  const send = async () => {
    const val = await prisma.takeValuation.findFirst({
      where: { takeId: access.take.id },
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
  const send = async () => {
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
  const col = await prisma.collection.findUnique({ where: { id: pid(req, "id") } });
  if (!col) return res.status(404).json({ error: "not_found" });
  if (col.ownerId !== req.user!.id) return res.status(403).json({ error: "forbidden" });
  const item = await prisma.collectionItem.create({
    data: { collectionId: col.id, takeId: String(req.body.takeId), note: req.body.note }
  });
  res.json({ item });
});

app.get("/v1/collections", optionalAuth, async (req, res) => {
  const collections = await prisma.collection.findMany({
    where: {
      OR: [
        { visibility: "PUBLIC" },
        ...(req.user ? [{ ownerId: req.user.id }] : [])
      ]
    },
    include: { items: true, owner: true }
  });
  res.json({ collections });
});

app.post("/v1/circles", requireAuth, async (req, res) => {
  const user = req.user!;
  const circle = await prisma.circle.create({
    data: {
      name: String(req.body.name ?? "Circle"),
      topic: String(req.body.topic ?? ""),
      createdBy: user.id,
      visibility: "PUBLIC",
      members: { create: { userId: user.id, role: "AUTHOR" } }
    }
  });
  res.json({ circle });
});

app.get("/v1/circles", optionalAuth, async (req, res) => {
  const circles = await prisma.circle.findMany({
    where: {
      OR: [
        { visibility: "PUBLIC" },
        ...(req.user ? [{ members: { some: { userId: req.user.id } } }] : [])
      ]
    },
    include: { members: true }
  });
  res.json({ circles });
});

app.post("/v1/takes/:id/counter", requireAuth, async (req, res) => {
  const user = req.user!;
  const access = await requirePublishedTake(pid(req, "id"), user.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  const original = access.take;
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
  const owned = await requireTakeAuthor(req.user!.id, pid(req, "takeId"));
  if (!owned.ok) return res.status(owned.status).json({ error: owned.error });
  const take = owned.take;
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

app.post("/webhooks/privy", async (req, res) => {
  const ok = await verifyPrivyWebhook(req);
  if (!ok) return res.status(401).json({ error: "invalid_webhook" });
  await prisma.webhookDelivery.create({ data: { source: "privy", payload: req.body ?? {} } });
  res.json({ ok: true });
});
app.post("/webhooks/alchemy", async (req, res) => {
  if (!verifyAlchemyWebhook(req)) return res.status(401).json({ error: "invalid_webhook" });
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

app.post("/v1/admin/live-smoke", requireAdmin, async (req, res) => {
  const flag = await prisma.featureFlag.findUnique({ where: { key: "admin_live_smoke" } });
  if (!flag?.enabled) return res.status(403).json({ error: "smoke_disabled" });
  const amountUsd = Math.min(1, Number(req.body?.amountUsd ?? 1));
  const { Queue } = await import("bullmq");
  const q = new Queue("execution", { connection: redis });
  const idempotencyKey = `smoke:${req.user!.id}:${Date.now()}`;
  await q.add("live-smoke", { userId: req.user!.id, amountUsd, idempotencyKey, kind: "INVEST" }, { jobId: idempotencyKey });
  res.json({ queued: true, amountUsd, idempotencyKey });
});

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  logError("api", "unhandled", err);
  res.status(500).json({ error: "internal", detail: err.message });
});

export function start() {
  process.on("unhandledRejection", (err) => {
    logError("api", "unhandledRejection", err);
  });
  void refreshChainlistRpcs().then((urls) => {
    if (urls.length) log("api", "chainlist rpcs", { n: urls.length });
  });
  const port = Number(process.env.PORT) || env.API_PORT;
  app.listen(port, "0.0.0.0", () => {
    log("api", "listening", { port, mode: env.APP_MODE });
  });
}
