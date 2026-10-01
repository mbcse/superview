import { createHash } from "node:crypto";
import { prisma } from "@takeandstake/db";

export const FACTS_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const THESIS_TTL_MS = 36 * 60 * 60 * 1000;

export type ThesisHit = { at: string; text?: string; parallelId?: string };
export type CompanyCache = {
  factsText?: string;
  factsAt?: string;
  thesis?: Record<string, ThesisHit>;
};

export function thesisKey(interpretation: string) {
  return createHash("sha256").update(interpretation.trim().toLowerCase()).digest("hex").slice(0, 16);
}

export function isFresh(atMs: number, ttlMs: number, now = Date.now()) {
  return Number.isFinite(atMs) && now - atMs < ttlMs;
}

export function readCache(profile: unknown): { rest: Record<string, unknown>; cache: CompanyCache } {
  const p = profile && typeof profile === "object" ? { ...(profile as Record<string, unknown>) } : {};
  const cache = (p._cache && typeof p._cache === "object" ? { ...(p._cache as CompanyCache) } : {}) as CompanyCache;
  delete p._cache;
  return { rest: p, cache };
}

export function factsFromCompany(c: {
  businessSummary: string;
  profile: unknown;
  refreshedAt: Date;
}): { text: string; fresh: boolean } {
  const { cache } = readCache(c.profile);
  const text = (cache.factsText || c.businessSummary || "").trim();
  const at = cache.factsAt ? Date.parse(cache.factsAt) : c.refreshedAt.getTime();
  return { text, fresh: Boolean(text) && isFresh(at, FACTS_TTL_MS) };
}

export function thesisNoteFromCompany(profile: unknown, key: string): string | null {
  const { cache } = readCache(profile);
  const hit = cache.thesis?.[key];
  if (!hit?.text) return null;
  if (!isFresh(Date.parse(hit.at), THESIS_TTL_MS)) return null;
  return hit.text;
}

export function parallelIdFromCompany(profile: unknown, key: string): string | null {
  const { cache } = readCache(profile);
  return cache.thesis?.[key]?.parallelId || null;
}

export function pruneThesis(thesis: Record<string, ThesisHit>, keep = 8) {
  const keys = Object.keys(thesis);
  if (keys.length <= keep) return thesis;
  const sorted = keys.sort((a, b) => Date.parse(thesis[a]?.at ?? "0") - Date.parse(thesis[b]?.at ?? "0"));
  const next = { ...thesis };
  for (const k of sorted.slice(0, keys.length - keep)) delete next[k];
  return next;
}

export async function saveResearchNotes(
  companyId: string,
  profile: unknown,
  opts: { factsText?: string; thesisKey?: string; thesisText?: string; parallelId?: string | null }
) {
  const { rest, cache } = readCache(profile);
  if (opts.factsText) {
    cache.factsText = opts.factsText.slice(0, 4000);
    cache.factsAt = new Date().toISOString();
  }
  if (opts.thesisKey && (opts.thesisText || opts.parallelId || opts.parallelId === null)) {
    const prev = cache.thesis?.[opts.thesisKey] ?? { at: new Date().toISOString() };
    cache.thesis = pruneThesis({
      ...(cache.thesis ?? {}),
      [opts.thesisKey]: {
        at: new Date().toISOString(),
        text: opts.thesisText?.slice(0, 4000) ?? prev.text,
        parallelId: opts.parallelId === null ? undefined : (opts.parallelId ?? prev.parallelId)
      }
    });
  }
  const nextProfile = { ...rest, _cache: cache } as object;
  await prisma.universeCompany.update({
    where: { id: companyId },
    data: {
      ...(opts.factsText ? { businessSummary: opts.factsText.slice(0, 4000), refreshedAt: new Date() } : {}),
      profile: nextProfile
    }
  });
  return nextProfile;
}
