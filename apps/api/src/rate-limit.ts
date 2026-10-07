import type { Redis } from "ioredis";

export async function hitRateLimit(redis: Redis, key: string, max: number, windowMs: number) {
  const k = `rl:${key}`;
  const n = await redis.incr(k);
  if (n === 1) await redis.pexpire(k, windowMs);
  return n <= max;
}

export const LIMIT_RESEARCH = { max: 8, windowMs: 60 * 60 * 1000 };
export const LIMIT_INVEST = { max: 20, windowMs: 60 * 60 * 1000 };
export const LIMIT_WITHDRAW = { max: 5, windowMs: 60 * 60 * 1000 };
