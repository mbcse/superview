import { Router } from "express";
import { optionalAuth } from "../middleware/auth.js";
import { loadViewableTake } from "../take-access.js";
import { createRedis, dropRedis } from "../redis.js";

export const streamRouter = Router();

streamRouter.get("/v1/stream/prices", optionalAuth, async (req, res) => {
  const wanted = String(req.query.symbols ?? "")
    .split(",")
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean);
  res.setHeader("content-type", "text/event-stream");
  res.setHeader("cache-control", "no-cache");
  res.setHeader("connection", "keep-alive");
  const sub = createRedis();
  await sub.subscribe("prices");
  sub.on("message", (_ch: string, message: string) => {
    try {
      const parsed = JSON.parse(message) as { quotes?: Array<{ symbol: string }> };
      if (wanted.length && parsed.quotes) {
        parsed.quotes = parsed.quotes.filter((q) => wanted.includes(q.symbol.toUpperCase()));
      }
      res.write(`data: ${JSON.stringify(parsed)}\n\n`);
    } catch {
      res.write(`data: ${message}\n\n`);
    }
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
