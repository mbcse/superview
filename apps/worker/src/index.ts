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
  QUOTES_CACHE_KEY
} from "@takeandstake/core";
import { describeLlm, enrichStale, isRetryableError, replyToComment, runDailyMonitor, runResearchPipeline, writeManusMemo } from "@takeandstake/ai";

const env = loadEnv();
function redisClient() {
  const client = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false });
  client.on("error", (err) => logError("redis", "error", err));
  return client;
}
const connection = redisClient();
const pub = redisClient();
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
    async () => {
      const r = await syncRobinhoodCatalog();
      const actions = await syncCorporateActions().catch((e) => {
        logError("worker", "corp actions", e);
        return { written: 0 };
      });
      const enrich = await enrichStale(12);
      log("worker", "catalog", { ...r, actions, enrich });
      return { ...r, actions, enrich };
    },
    { connection, lockDuration: 180_000 }
  )
);

let lastPersistAt = 0;
let lastChainlinkAt = 0;
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

async function hydratePrevClose() {
  const start = startOfNyDay();
  const rows = await prisma.$queryRaw<Array<{ symbol: string; price: unknown }>>`
    SELECT t.symbol, s.price
    FROM "PriceSnapshot" s
    JOIN "StockToken" t ON t.id = s."tokenId"
    JOIN (
      SELECT "tokenId", MAX("observedAt") AS seen
      FROM "PriceSnapshot"
      WHERE source = 'RH_REST'::"PriceSource" AND "observedAt" < ${start}
      GROUP BY "tokenId"
    ) last ON last."tokenId" = s."tokenId" AND last.seen = s."observedAt"
    WHERE s.source = 'RH_REST'::"PriceSource"
  `;
  for (const r of rows) {
    const n = Number(r.price);
    if (Number.isFinite(n)) prevClose.set(String(r.symbol).toUpperCase(), n);
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
          if (lastMids.size) {
            for (const [k, v] of lastMids) prevClose.set(k, v);
          }
          sessionOpen.clear();
          sessionDay = day;
        }
        const prior = prevClose.size ? prevClose : sessionOpen;
        const rh = await ingestRobinhoodPrices({ persist: false, prior });
        for (const q of rh.payload) {
          const k = q.symbol.toUpperCase();
          lastMids.set(k, q.last);
          if (q.tokenLast != null) lastTokens.set(k, q.tokenLast);
          if (!sessionOpen.has(k)) sessionOpen.set(k, q.last);
        }
        const cache = JSON.stringify({ at: rh.at, quotes: rh.payload });
        await pub.set(QUOTES_CACHE_KEY, cache);
        await publish("prices", { at: rh.at, quotes: rh.payload });
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
      log("worker", `${stage}  ${message}`, { run: runId });
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
  await queues.pricing.add("tick", {}, { repeat: { every: 1_000 }, jobId: "price-tick-1s" });
  await queues.portfolio.add("value", {}, { repeat: { every: 15_000 }, jobId: "mark" });
  await queues.outbox.add("drain", {}, { repeat: { every: 5_000 }, jobId: "outbox" });
  await queues.enrichment.add("stale", {}, { repeat: { every: 10 * 60_000 }, jobId: "enrich" });
  await queues.agent.add("daily", {}, { repeat: { pattern: "0 6 * * 1-5", tz: "America/New_York" }, jobId: "agent-daily" });
  await queues.agent.add("intraday", {}, { repeat: { pattern: "30 10,14 * * 1-5", tz: "America/New_York" }, jobId: "agent-intraday" });
  await queues.catalog.add("boot", {}, { jobId: `catalog-boot-${Date.now()}` });
}

schedule()
  .then(async () => {
    const extra = await refreshChainlistRpcs().catch(() => []);
    if (extra.length) log("worker", "chainlist rpcs", { n: extra.length });
    await hydratePrevClose().catch((e) => logError("worker", "prevclose", e));
    log("worker", "scheduled", describeLlm());
  })
  .catch((e) => logError("worker", "schedule fail", e));

process.on("unhandledRejection", (err) => {
  if (isStaleLock(err)) return;
  logError("worker", "unhandledRejection", err);
});
