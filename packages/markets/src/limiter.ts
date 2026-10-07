import type { Redis } from "ioredis";

type Bucket = { tokens: number; updatedAt: number; rps: number; burst: number };

const local = new Map<string, Bucket>();
let redis: Redis | null = null;

export function setLimiterRedis(client: Redis | null) {
  redis = client;
}

export function takeToken(provider: string, rps: number, burst = rps): boolean {
  const now = Date.now();
  const cur = local.get(provider) ?? { tokens: burst, updatedAt: now, rps, burst };
  const elapsed = (now - cur.updatedAt) / 1000;
  cur.tokens = Math.min(burst, cur.tokens + elapsed * rps);
  cur.updatedAt = now;
  cur.rps = rps;
  cur.burst = burst;
  if (cur.tokens < 1) {
    local.set(provider, cur);
    return false;
  }
  cur.tokens -= 1;
  local.set(provider, cur);
  return true;
}

export async function waitToken(provider: string, rps: number, burst = rps, timeoutMs = 8_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (redis) {
      const ok = await redisTake(provider, rps, burst);
      if (ok) return true;
    } else if (takeToken(provider, rps, burst)) {
      return true;
    }
    await new Promise((r) => setTimeout(r, 80));
  }
  return false;
}

async function redisTake(provider: string, rps: number, burst: number): Promise<boolean> {
  if (!redis) return takeToken(provider, rps, burst);
  const key = `rl:${provider}`;
  const now = Date.now();
  try {
    const raw = await redis.get(key);
    const cur = raw ? (JSON.parse(raw) as Bucket) : { tokens: burst, updatedAt: now, rps, burst };
    const elapsed = (now - cur.updatedAt) / 1000;
    cur.tokens = Math.min(burst, cur.tokens + elapsed * rps);
    cur.updatedAt = now;
    if (cur.tokens < 1) {
      await redis.set(key, JSON.stringify(cur), "PX", 15_000);
      return false;
    }
    cur.tokens -= 1;
    await redis.set(key, JSON.stringify(cur), "PX", 15_000);
    return true;
  } catch {
    return takeToken(provider, rps, burst);
  }
}

export const LIMITS = {
  jupiter: { rps: 0.8, burst: 2 },
  jupiterLive: { rps: 0.2, burst: 1 },
  bags: { rps: 1.3, burst: 4 },
  dexscreener: { rps: 5, burst: 8 },
  xstocks: { rps: 0.4, burst: 2 },
  pump: { rps: 2, burst: 4 },
  solana: { rps: 8, burst: 12 }
} as const;
