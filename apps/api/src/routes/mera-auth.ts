import { Router } from "express";
import { issueMeraNonce, meraMessage, verifyMeraLogin } from "../services/mera-session.js";
import { redis } from "../redis.js";

export const meraAuthRouter = Router();

meraAuthRouter.post("/v1/auth/mera/nonce", async (_req, res) => {
  try {
    const nonce = await issueMeraNonce(redis);
    res.json({ nonce, message: meraMessage(nonce, "") });
  } catch (e) {
    res.status(503).json({ error: e instanceof Error ? e.message : "nonce_failed" });
  }
});

meraAuthRouter.post("/v1/auth/mera/verify", async (req, res) => {
  const nonce = String(req.body?.nonce ?? "");
  const address = String(req.body?.address ?? "");
  const signature = String(req.body?.signature ?? "") as `0x${string}`;
  const credentialId = String(req.body?.credentialId ?? "");
  const solanaAddress = req.body?.solanaAddress ? String(req.body.solanaAddress) : undefined;
  if (!nonce || !address || !signature || !credentialId) return res.status(400).json({ error: "bad_request" });
  try {
    const out = await verifyMeraLogin({ nonce, address, signature, credentialId, solanaAddress }, redis);
    res.json({ token: out.token, handle: out.user.handle, userId: out.user.id, address });
  } catch (e) {
    res.status(401).json({ error: e instanceof Error ? e.message : "mera_failed" });
  }
});
