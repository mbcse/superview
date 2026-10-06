import { Router } from "express";
import { optionalAuth } from "../middleware/auth.js";
import { loadViewableTake } from "../take-access.js";
import { createRedis, dropRedis, redis } from "../redis.js";

export const streamRouter = Router();

streamRouter.get("/v1/stream/prices", optionalAuth, async (req, res) => {
  const wanted = String(req.query.ids ?? req.query.symbols ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  const heartbeat = wanted.filter((id) => id.length > 16);
  if (heartbeat.length) {
    void redis.sadd("hot:sse", ...heartbeat).then(() => redis.expire("hot:sse", 45)).catch(() => undefined);
  }
  const world = String(req.query.world ?? "").toUpperCase();
  const channels = world === "MEMES" ? ["prices:MEMES"] : world === "STOCKS" ? ["prices:STOCKS"] : ["prices", "prices:STOCKS", "prices:MEMES"];
  res.setHeader("content-type", "text/event-stream");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("connection", "keep-alive");
  const sub = createRedis();
  await sub.subscribe(...channels);
  sub.on("message", (_ch: string, message: string) => {
    try {
      const parsed = JSON.parse(message) as { quotes?: Array<{ symbol: string; tokenId?: string }> };
      if (wanted.length && parsed.quotes) {
        parsed.quotes = parsed.quotes.filter((q) => {
          const sym = q.symbol.toUpperCase();
          const id = String(q.tokenId ?? "").toUpperCase();
          return wanted.includes(sym) || wanted.includes(id);
        });
      }
      res.write(`data: ${JSON.stringify(parsed)}\n\n`);
    } catch {
      res.write(`data: ${message}\n\n`);
    }
  });
  req.on("close", () => dropRedis(sub));
});

streamRouter.get("/v1/stream/orders/:id", optionalAuth, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  res.setHeader("content-type", "text/event-stream");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("connection", "keep-alive");
  const sub = createRedis();
  await sub.subscribe(`order:${id}`);
  sub.on("message", (_ch: string, message: string) => {
    res.write(`data: ${message}\n\n`);
  });
  req.on("close", () => dropRedis(sub));
});

streamRouter.get("/v1/stream/takes/:id", optionalAuth, async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const access = await loadViewableTake(id ?? "", req.user?.id);
  if (!access.ok) return res.status(access.status).json({ error: access.error });
  res.setHeader("content-type", "text/event-stream");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("connection", "keep-alive");
  const sub = createRedis();
  await sub.subscribe(`take:${access.take.id}`);
  sub.on("message", (_ch: string, message: string) => {
    res.write(`data: ${message}\n\n`);
  });
  req.on("close", () => dropRedis(sub));
});
