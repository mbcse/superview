import { prisma } from "@takeandstake/db";

export type TakeAccess = {
  status: string;
  visibility: string;
  authorId: string;
};

export function canViewTake(take: TakeAccess, userId?: string | null) {
  if (userId && take.authorId === userId) return true;
  return take.status === "PUBLISHED" && (take.visibility === "PUBLIC" || take.visibility === "UNLISTED");
}

export function canSocialMutateTake(take: TakeAccess, userId?: string | null) {
  return Boolean(userId) && canViewTake(take, userId) && take.status === "PUBLISHED";
}

export async function loadViewableTake(takeId: string, userId?: string | null) {
  const take = await prisma.take.findUnique({ where: { id: takeId } });
  if (!take || !canViewTake(take, userId)) return { ok: false as const, error: "not_found" as const, status: 404 as const };
  return { ok: true as const, take };
}

export async function requirePublishedTake(takeId: string, userId?: string | null) {
  const take = await prisma.take.findUnique({ where: { id: takeId } });
  if (!take || !canSocialMutateTake(take, userId)) return { ok: false as const, error: "not_found" as const, status: 404 as const };
  return { ok: true as const, take };
}
