import { prisma } from "@takeandstake/db";
import { executorFor, liveFlagFor, sourceRestricted, venueSourceFor, type World } from "@takeandstake/shared";

export type LiveUser = {
  id: string;
  jurisdictionStatus?: string | null;
  country?: string | null;
  memesRiskAckAt?: Date | null;
};

export async function assertLiveAllowed(opts: {
  chainId: number;
  world: World;
  user: LiveUser;
  env: { APP_MODE: string };
}): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    executorFor(opts.chainId);
  } catch {
    return { ok: false, error: "venue_not_live" };
  }
  if (opts.env.APP_MODE !== "live") return { ok: false, error: "live_disabled" };
  const pause = await prisma.featureFlag.findUnique({ where: { key: "pause_trading" } });
  if (pause?.enabled) return { ok: false, error: "paused" };
  const master = await prisma.featureFlag.findUnique({ where: { key: "live_trading" } });
  if (opts.world !== "MEMES" && opts.chainId === 4663 && !master?.enabled) {
    return { ok: false, error: "live_disabled" };
  }
  const flag = await prisma.featureFlag.findUnique({ where: { key: liveFlagFor(opts.world, opts.chainId) } });
  if (!flag?.enabled) return { ok: false, error: "live_disabled" };
  if (opts.user.jurisdictionStatus === "RESTRICTED") return { ok: false, error: "restricted_jurisdiction" };
  const source = venueSourceFor(opts.world, opts.chainId);
  if (sourceRestricted(opts.world === "MEMES" ? "MEMES" : source, opts.user.country)) {
    return { ok: false, error: "restricted_jurisdiction" };
  }
  if (opts.world === "MEMES" && !opts.user.memesRiskAckAt) return { ok: false, error: "memes_ack_required" };
  return { ok: true };
}

export function groupHoldingsByChain<T extends { token: { chainId: number } }>(holdings: T[]) {
  const map = new Map<number, T[]>();
  for (const h of holdings) {
    const id = h.token.chainId;
    const list = map.get(id) ?? [];
    list.push(h);
    map.set(id, list);
  }
  return map;
}
