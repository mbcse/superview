import { createServer } from "node:http";
import { Queue, UnrecoverableError, Worker } from "bullmq";
import { Redis } from "ioredis";
import { loadEnv } from "@takeandstake/config";
import { prisma } from "@takeandstake/db";
import { refreshChainlistRpcs } from "@takeandstake/chain";
import { formatErr, log, logError } from "@takeandstake/shared";
import {
  ingestChainlinkSnapshots,
  ingestRobinhoodPrices,
  persistRobinhoodQuotes,
  markPockets,
  markPublishedTakes,
  syncRobinhoodCatalog,
  syncCorporateActions,
  QUOTES_CACHE_KEY,
  QUOTES_ASSET_KEY,
  setPriceAliases,
  lookupPx,
  lastCashSessionStart,
  isNyWeekend,
  prevCloseByTokens
} from "@takeandstake/core";
import { describeLlm, enrichStale, isRetryableError, replyToComment, runDailyMonitor, runResearchPipeline, writeManusMemo } from "@takeandstake/ai";
import { quoteSolanaAssets, syncBagsCatalog, syncJupiterMemeCatalog, syncXStocksCatalog, refreshMemeRisk, setLimiterRedis, partitionHotSets, pushAlert, CORE_XSTOCKS } from "@takeandstake/markets";
import { handleExecutionJob, reportProviderHealth } from "./execution.js";

const env = loadEnv();

async function unlockRedisWrites() {
  const client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableReadyCheck: false, lazyConnect: true });
  try {
    await client.connect();
    await client.config("SET", "stop-writes-on-bgsave-error", "no");
    await client.config("SET", "save", "");
    log("redis", "writes unlocked");
  } catch (err) {
    logError("redis", "config", err);
  } finally {
    client.disconnect();
  }
}

function redisClient() {
  const client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
  client.on("error", (err) => logError("redis", "error", err));
  return client;
}
const connection = redisClient();
const pub = redisClient();
setLimiterRedis(pub);
const rpc = env.ALCHEMY_RPC_URL || env.ROBINHOOD_RPC_URL || env.ROBINHOOD_RPC_URLS;

function isStaleLock(err: unknown) {
  return /Missing lock/i.test(err instanceof Error ? err.message : String(err));
}

function hushLocks(name: string, worker: Worker) {
  worker.on("error", (err) => {
    if (isStaleLock(err)) return;
    logError("worker", name, err);
  });
  worker.on("failed", (job, err) => {
    if (isStaleLock(err)) return;
    logError("worker", `${name} failed`, err, { job: job?.name });
  });
}

export const queues = {
  catalog: new Queue("catalog", { connection }),
  pricing: new Queue("pricing", { connection }),
  research: new Queue("research", {
    connection,
    defaultJobOptions: { attempts: 6, backoff: { type: "exponential", delay: 15_000 } }
  }),
  execution: new Queue("execution", { connection }),
  wallet: new Queue("wallet", { connection }),
  portfolio: new Queue("portfolio", { connection }),
  agent: new Queue("agent", { connection }),
  social: new Queue("social", { connection }),
  notify: new Queue("notify", { connection }),
  outbox: new Queue("outbox", { connection }),
  enrichment: new Queue("enrichment", { connection })
};

async function publish(channel: string, payload: unknown) {
  await pub.publish(channel, JSON.stringify(payload));
}

hushLocks(
  "catalog",
  new Worker(
    "catalog",
    async (job) => {
      if (job.name === "risk-held") {
        const risk = await refreshMemeRisk(true).catch((e) => {
          logError("worker", "meme risk held", e);
          return { n: 0 };
        });
        return { risk };
      }
      if (job.name === "risk-catalog") {
        const risk = await refreshMemeRisk(false).catch((e) => {
          logError("worker", "meme risk catalog", e);
          return { n: 0 };
        });
        return { risk };
      }
      const r = await syncRobinhoodCatalog();
      const xstocks = await syncXStocksCatalog().catch((e) => {
        logError("worker", "xstocks catalog", e);
        return { count: 0 };
      });
      const bags = await syncBagsCatalog().catch((e) => {
        logError("worker", "bags catalog", e);
        return { count: 0 };
      });
      const memes = await syncJupiterMemeCatalog().catch((e) => {
        logError("worker", "meme catalog", e);
        return { count: 0 };
      });
      const actions = await syncCorporateActions().catch((e) => {
        logError("worker", "corp actions", e);
        return { written: 0 };
      });
      const enrich = await enrichStale(12);
      await reportProviderHealth();
      log("worker", "catalog", { ...r, xstocks, bags, memes, actions, enrich });
      return { ...r, xstocks, bags, memes, actions, enrich };
    },
    { connection, lockDuration: 180_000 }
  )
);

let lastPersistAt = 0;
let lastSolPersistAt = 0;
let lastChainlinkAt = 0;
let lastT1 = 0;
let lastT2 = 0;
let lastT3 = 0;
let hotAt = 0;
let cachedHot: ReturnType<typeof partitionHotSets> | null = null;
let pricingBusy = false;
const lastMids = new Map<string, number>();
const lastTokens = new Map<string, number>();
const lastPersisted = new Map<string, number>();
const sessionOpen = new Map<string, number>();
const prevClose = new Map<string, number>();
let sessionDay = "";

function nyDay(d = new Date()) {
  return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

function startOfNyDay(now = Date.now()) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const ymd = fmt.format(new Date(now));
  let lo = now - 36 * 60 * 60 * 1000;
  let hi = now;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (fmt.format(new Date(mid)) === ymd) hi = mid;
    else lo = mid;
  }
  return new Date(hi);
}

function tokenIdsFromTakes(rows: Array<{ revisions?: Array<{ target?: { holdings?: Array<{ tokenId: string }> | null } | null }> }>) {
  return rows.flatMap((t) => t.revisions?.[0]?.target?.holdings?.map((h) => h.tokenId) ?? []);
}

async function loadHotSets() {
  if (cachedHot && Date.now() - hotAt < 15_000) return cachedHot;
  const [pockets, trending, published, coreX, xstocks, sse] = await Promise.all([
    prisma.pocket.findMany({
      where: { status: "ACTIVE" },
      select: {
        take: {
          select: {
            revisions: {
              take: 1,
              orderBy: { number: "desc" as const },
              select: { target: { select: { holdings: { select: { tokenId: true } } } } }
            }
          }
        }
      }
    }),
    prisma.take.findMany({
      where: { status: "PUBLISHED" },
      take: 60,
      orderBy: { createdAt: "desc" },
      select: {
        revisions: {
          take: 1,
          orderBy: { number: "desc" as const },
          select: { target: { select: { holdings: { select: { tokenId: true } } } } }
        }
      }
    }),
    prisma.take.findMany({
      where: { status: "PUBLISHED" },
      take: 200,
      select: {
        revisions: {
          take: 1,
          orderBy: { number: "desc" as const },
          select: { target: { select: { holdings: { select: { tokenId: true } } } } }
        }
      }
    }),
    prisma.stockToken.findMany({
      where: {
        source: "XSTOCKS",
        status: "ACTIVE",
        OR: [{ xstocksSymbol: { in: [...CORE_XSTOCKS] } }, { symbol: { in: [...CORE_XSTOCKS] } }]
      },
      select: { id: true }
    }),
    prisma.stockToken.findMany({ where: { source: "XSTOCKS", status: "ACTIVE" }, select: { id: true }, take: 40 }),
    pub.smembers("hot:sse").catch(() => [] as string[])
  ]);
  cachedHot = partitionHotSets({
    pocketAssetIds: [...tokenIdsFromTakes(pockets.map((p) => p.take)), ...sse],
    trendingAssetIds: tokenIdsFromTakes(trending),
    publishedAssetIds: tokenIdsFromTakes(published),
    xstockIds: [...new Set([...coreX, ...xstocks].map((t) => t.id))]
  });
  hotAt = Date.now();
  return cachedHot;
}

async function hydratePrevClose() {
  const start = lastCashSessionStart();
  const tokens = await prisma.stockToken.findMany({
    where: { chainId: 4663 },
    select: { id: true, symbol: true }
  });
  const closes = await prevCloseByTokens(tokens);
  for (const t of tokens) {
    const px = closes.get(t.id);
    if (px != null) setPriceAliases(prevClose, t.symbol, px);
  }
  log("worker", "prevclose", { n: prevClose.size, from: start.toISOString() });
}

hushLocks(
  "pricing",
  new Worker(
    "pricing",
    async () => {
      if (pricingBusy) return { skipped: true };
      pricingBusy = true;
      try {
        const day = nyDay();
        if (day !== sessionDay) {
          if (lastMids.size && !isNyWeekend()) {
            for (const [k, v] of lastMids) setPriceAliases(prevClose, k, v);
          }
          sessionOpen.clear();
          sessionDay = day;
        }
        const rh = await ingestRobinhoodPrices({ persist: false, prior: prevClose });
        for (const q of rh.payload) {
          setPriceAliases(lastMids, q.symbol, q.last);
          if (q.tokenLast != null) setPriceAliases(lastTokens, q.symbol, q.tokenLast);
          if (lookupPx(sessionOpen, q.symbol) == null) setPriceAliases(sessionOpen, q.symbol, q.last);
        }
        let quotes: Array<{
          tokenId?: string;
          symbol: string;
          last: number;
          tokenLast?: number | null;
          bid?: number | null;
          ask?: number | null;
          halt?: boolean;
          chgPct?: number | null;
          volumeUsd?: number | null;
          asOf?: string;
          stale?: boolean;
        }> = rh.payload.map((q) => ({ ...q, tokenId: q.tokenId }));
        const worldById = new Map<string, "STOCKS" | "MEMES">();
        const now = Date.now();
        const hot = await loadHotSets();
        const want = new Set<string>();
        if (now - lastT1 > 2_500) {
          for (const id of hot.t1) want.add(id);
          lastT1 = now;
        }
        if (now - lastT2 > 15_000) {
          for (const id of hot.t2) want.add(id);
          lastT2 = now;
        }
        if (now - lastT3 > 5 * 60_000) {
          for (const id of hot.t3) want.add(id);
          lastT3 = now;
        }
        if (want.size) {
          const sol = await prisma.stockToken.findMany({
            where: { id: { in: [...want] }, chainId: 101, status: "ACTIVE" }
          });
          for (const t of sol) worldById.set(t.id, t.world === "MEMES" ? "MEMES" : "STOCKS");
          const solQ = sol.length
            ? await quoteSolanaAssets(
                sol.map((t) => ({
                  id: t.id,
                  symbol: t.symbol,
                  chainId: t.chainId,
                  contractAddress: t.contractAddress,
                  decimals: t.decimals,
                  source: t.source,
                  venue: t.venue,
                  xstocksSymbol: t.xstocksSymbol
                }))
              ).catch((e) => {
                logError("worker", "sol quotes", e);
                return new Map();
              })
            : new Map();
          let oldest = now;
          const solRows: Array<{
            tokenId: string;
            source: "JUPITER" | "XSTOCKS" | "DEXSCREENER" | "BAGS" | "PUMPFUN";
            price: number;
            volumeUsd: number | null;
            halt: boolean;
            updatedAt: Date;
          }> = [];
          for (const [id, q] of solQ) {
            oldest = Math.min(oldest, q.observedAt);
            const tok = sol.find((t) => t.id === id);
            if (tok) {
              setPriceAliases(lastMids, tok.symbol, q.last, tok.source);
              setPriceAliases(lastTokens, tok.symbol, q.last, tok.source);
            }
            quotes.push({
              tokenId: id,
              symbol: tok?.symbol ?? id,
              last: q.last,
              tokenLast: q.last,
              bid: q.last,
              ask: q.last,
              halt: q.halt,
              chgPct: q.chg,
              volumeUsd: q.liquidityUsd,
              asOf: new Date(q.observedAt).toISOString(),
              stale: tok?.world === "MEMES" ? now - q.observedAt > 2 * 60_000 : now - q.observedAt > 10 * 60_000
            });
            solRows.push({
              tokenId: id,
              source: q.provider === "CHAINLINK" || q.provider === "RH_REST" ? "JUPITER" : q.provider,
              price: q.last,
              volumeUsd: q.liquidityUsd,
              halt: q.halt,
              updatedAt: new Date(q.observedAt)
            });
          }
          if (solRows.length && (lastSolPersistAt === 0 || now - lastSolPersistAt > 15_000)) {
            await prisma.priceSnapshot.createMany({ data: solRows }).catch(() => {});
            lastSolPersistAt = now;
          }
          if (hot.t1.length && now - oldest > 15_000) pushAlert("t1_stale", String(now - oldest));
        }
        const cache = JSON.stringify({ at: rh.at, quotes });
        await pub.set(QUOTES_CACHE_KEY, cache);
        const assetFields: Record<string, string> = {};
        for (const q of quotes) {
          if (q.tokenId) assetFields[q.tokenId] = JSON.stringify(q);
        }
        if (Object.keys(assetFields).length) await pub.hset(QUOTES_ASSET_KEY, assetFields);
        const stocks = quotes.filter((q) => (q.tokenId ? worldById.get(q.tokenId) ?? "STOCKS" : "STOCKS") === "STOCKS");
        const memes = quotes.filter((q) => q.tokenId && worldById.get(q.tokenId) === "MEMES");
        await publish("prices", { at: rh.at, quotes });
        await publish("prices:STOCKS", { at: rh.at, quotes: stocks });
        await publish("prices:MEMES", { at: rh.at, quotes: memes });
        const moved = rh.payload.some((q) => {
          const prev = lastPersisted.get(q.symbol.toUpperCase());
          return prev == null || Math.abs(prev - q.last) > 1e-6;
        });
        const due = Date.now() - lastPersistAt > 30_000;
        if (moved || due) {
          await persistRobinhoodQuotes(rh.payload, rh.haltUpdates, new Date(rh.at));
          if (Date.now() - lastChainlinkAt > 5 * 60_000) {
            await ingestChainlinkSnapshots(rpc).catch((e) => logError("worker", "chainlink", e));
            lastChainlinkAt = Date.now();
          }
          lastPersistAt = Date.now();
          for (const q of rh.payload) lastPersisted.set(q.symbol.toUpperCase(), q.last);
        }
        return { ...rh, persisted: moved || due };
      } finally {
        pricingBusy = false;
      }
    },
    { connection, concurrency: 1, lockDuration: 120_000 }
  )
);

const researchWorker = new Worker(
  "research",
  async (job) => {
    const runId = String(job.data.runId);
    log("worker", "research queued", { run: runId, attempt: job.attemptsMade + 1 });
    const emit = async (stage: string, message: string, payload?: unknown) => {
      const noisy = stage === "retrieve" && /^Screened /i.test(message);
      if (!noisy) log("worker", `${stage}  ${message}`, { run: runId });
      await prisma.researchEvent.create({ data: { runId, stage, message, payload: payload as object | undefined } });
      await publish(`research:${runId}`, { stage, message, payload, at: new Date().toISOString() });
    };
    try {
      const out = await runResearchPipeline(runId, emit);
      log("worker", "research done", { run: runId });
      return out;
    } catch (e) {
      const err = formatErr(e);
      await prisma.researchRun.update({
        where: { id: runId },
        data: { error: err, finishedAt: null }
      });
      if (isRetryableError(e)) {
        await emit("retry", `Paused · will resume without redoing finished work · ${err}`);
        throw e;
      }
      await prisma.researchRun.update({
        where: { id: runId },
        data: { status: "FAILED", error: err, finishedAt: new Date() }
      });
      await emit("failed", err);
      logError("worker", "research fail", e, { run: runId });
      throw new UnrecoverableError(err);
    }
  },
  { connection, concurrency: 2, lockDuration: 15 * 60_000, stalledInterval: 60_000, maxStalledCount: 2 }
);
hushLocks("research", researchWorker);

researchWorker.on("failed", async (job, err) => {
  if (!job) return;
  const attempts = job.opts.attempts ?? 1;
  if (job.attemptsMade < attempts && isRetryableError(err)) return;
  const runId = String(job.data.runId);
  const msg = formatErr(err);
  await prisma.researchRun.update({
    where: { id: runId },
    data: { status: "FAILED", error: msg, finishedAt: new Date() }
  });
  logError("worker", "research exhausted", err, { run: runId, attempts: job.attemptsMade });
});

hushLocks(
  "enrichment",
  new Worker(
    "enrichment",
    async () => {
      const r = await enrichStale(5);
      if (r.enriched || "skipped" in r) log("worker", "enrich", r);
      return r;
    },
    { connection, lockDuration: 180_000 }
  )
);

hushLocks(
  "portfolio",
  new Worker(
    "portfolio",
    async () => {
      await markPublishedTakes(lastMids, lastTokens);
      await markPockets();
    },
    { connection, lockDuration: 90_000 }
  )
);

hushLocks(
  "agent",
  new Worker(
  "agent",
  async (job) => {
    if (job.name === "memo") {
      log("worker", "memo", { take: String(job.data.takeId) });
      return writeManusMemo(String(job.data.takeId));
    }
    if (job.name === "one") {
      log("worker", "agent one", { take: String(job.data.takeId) });
      const out = await runDailyMonitor(String(job.data.takeId));
      await publish(`take:${job.data.takeId}`, { kind: "agent", out, at: new Date().toISOString() });
      return out;
    }
    if (job.name === "memes-hourly") {
      const memes = await prisma.take.findMany({ where: { status: "PUBLISHED", world: "MEMES" }, select: { id: true }, take: 40 });
      log("worker", "meme monitor", { takes: memes.length });
      for (const t of memes) {
        try {
          await runDailyMonitor(t.id);
        } catch (e) {
          logError("worker", "meme monitor", e, { take: t.id });
        }
      }
      return { takes: memes.length };
    }
    const takes = await prisma.take.findMany({ where: { status: "PUBLISHED" }, select: { id: true }, take: 40 });
    log("worker", "agent sweep", { takes: takes.length });
    for (const t of takes) {
      try {
        await runDailyMonitor(t.id);
      } catch (e) {
        logError("worker", "agent", e, { take: t.id });
      }
    }
  },
    { connection, lockDuration: 180_000 }
  )
);

hushLocks(
  "execution",
  new Worker(
    "execution",
    async (job) => {
      log("worker", "execution", { name: job.name, pocket: job.data.pocketId });
      return handleExecutionJob(job.data);
    },
    { connection, lockDuration: 10 * 60_000, concurrency: 2 }
  )
);

hushLocks(
  "social",
  new Worker(
    "social",
    async (job) => {
      if (job.name === "reply") {
        log("worker", "reply", { comment: String(job.data.commentId) });
        return replyToComment(String(job.data.commentId));
      }
    },
    { connection, lockDuration: 90_000 }
  )
);

hushLocks(
  "outbox",
  new Worker(
    "outbox",
    async () => {
      const events = await prisma.outboxEvent.findMany({ where: { processedAt: null }, take: 50 });
      for (const e of events) {
        await prisma.outboxEvent.update({ where: { id: e.id }, data: { processedAt: new Date() } });
      }
    },
    { connection, lockDuration: 60_000 }
  )
);

async function schedule() {
  await queues.catalog.add("sync", {}, { repeat: { every: 15 * 60_000 }, jobId: "catalog-sync" });
  await queues.catalog.add("risk-held", {}, { repeat: { every: 60_000 }, jobId: "meme-risk-held" });
  await queues.catalog.add("risk-catalog", {}, { repeat: { every: 10 * 60_000 }, jobId: "meme-risk-catalog" });
  await queues.pricing.add("tick", {}, { repeat: { every: 1_000 }, jobId: "price-tick-1s" });
  await queues.portfolio.add("value", {}, { repeat: { every: 15_000 }, jobId: "mark" });
  await queues.outbox.add("drain", {}, { repeat: { every: 5_000 }, jobId: "outbox" });
  await queues.enrichment.add("stale", {}, { repeat: { every: 10 * 60_000 }, jobId: "enrich" });
  await queues.agent.add("daily", {}, { repeat: { pattern: "0 6 * * 1-5", tz: "America/New_York" }, jobId: "agent-daily" });
  await queues.agent.add("intraday", {}, { repeat: { pattern: "30 10,14 * * 1-5", tz: "America/New_York" }, jobId: "agent-intraday" });
  await queues.agent.add("memes-hourly", {}, { repeat: { every: 60 * 60_000 }, jobId: "agent-memes-hourly" });
  await queues.catalog.add("boot", {}, { jobId: `catalog-boot-${Date.now()}` });
}

function listenHealth() {
  const port = Number(process.env.PORT);
  if (!Number.isFinite(port) || port <= 0) return;
  createServer((req, res) => {
    if (req.url === "/health" || req.url === "/") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, role: "worker" }));
      return;
    }
    res.writeHead(404);
    res.end();
  }).listen(port, "0.0.0.0", () => log("worker", "health", { port }));
}

schedule()
  .then(async () => {
    await unlockRedisWrites();
    const extra = await refreshChainlistRpcs().catch(() => []);
    if (extra.length) log("worker", "chainlist rpcs", { n: extra.length });
    await hydratePrevClose().catch((e) => logError("worker", "prevclose", e));
    log("worker", "scheduled", describeLlm());
    listenHealth();
  })
  .catch((e) => logError("worker", "schedule fail", e));

process.on("unhandledRejection", (err) => {
  if (isStaleLock(err)) return;
  logError("worker", "unhandledRejection", err);
});
