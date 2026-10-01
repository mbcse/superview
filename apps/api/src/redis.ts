import { Redis } from "ioredis";
import { loadEnv } from "@takeandstake/config";
import { logError } from "@takeandstake/shared";

const env = loadEnv();

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
