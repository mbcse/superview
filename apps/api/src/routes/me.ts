import { Router } from "express";
import { prisma } from "@takeandstake/db";
import { RESTRICTED_COUNTRIES } from "@takeandstake/shared";
import { requireAuth, upsertPrivyUser } from "../middleware/auth.js";

export const meRouter = Router();

meRouter.get("/v1/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    include: { wallets: true }
  });
  res.json({ user });
});

meRouter.post("/v1/me/sync", requireAuth, async (req, res) => {
  const user = await upsertPrivyUser(req.user!.privyId, {
    displayName: typeof req.body?.displayName === "string" ? req.body.displayName : req.user!.displayName,
    walletAddress: typeof req.body?.walletAddress === "string" ? req.body.walletAddress : undefined
  });
  res.json({ user });
});

meRouter.post("/v1/me/attestation", requireAuth, async (req, res) => {
  const country = String(req.body?.country ?? "").toUpperCase();
  const restricted = (RESTRICTED_COUNTRIES as readonly string[]).includes(country);
  const user = await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      country: country || undefined,
      attestedNotRestrictedAt: new Date(),
      jurisdictionStatus: restricted ? "RESTRICTED" : "ALLOWED"
    }
  });
  res.json({ user });
});

meRouter.post("/v1/me/mode", requireAuth, async (req, res) => {
  const mode = req.body?.mode === "LIVE" ? "LIVE" : "WATCH";
  if (mode === "LIVE") {
    await prisma.user.update({
      where: { id: req.user!.id },
      data: { liveUnlockedAt: new Date() }
    });
  }
  res.json({ mode });
});

meRouter.post("/v1/me/delete", requireAuth, async (req, res) => {
  await prisma.user.update({
    where: { id: req.user!.id },
    data: {
      displayName: "Deleted",
      handle: `deleted_${req.user!.id.slice(-8)}`,
      jurisdictionStatus: "RESTRICTED"
    }
  });
  res.json({ status: "scheduled", message: "Account deletion started. You will lose access immediately." });
});
