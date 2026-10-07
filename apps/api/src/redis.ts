import { Redis } from "ioredis";
import { loadEnv } from "@takeandstake/config";
import { log, logError } from "@takeandstake/shared";

const env = loadEnv();

export async function unlockRedisWrites() {
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

export function createRedis() {
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false
  });
  redis.on("error", (err) => {
    logError("redis", "error", err);
  });
  return redis;
}

export const redis = createRedis();

export function dropRedis(client: Redis) {
  client.removeAllListeners();
  client.on("error", () => undefined);
  if (client.status !== "end") client.disconnect();
}
