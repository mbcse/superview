import { createHmac, timingSafeEqual } from "node:crypto";

const SVIX_MAX_SKEW_SEC = 300;

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function svixKey(secret: string) {
  if (secret.startsWith("whsec_")) return Buffer.from(secret.slice(6), "base64");
  return Buffer.from(secret);
}

export function verifySvixSignature(opts: {
  secret: string;
  id: string;
  timestamp: string;
  signatureHeader: string;
  body: string;
  nowSec?: number;
}) {
  if (!opts.secret || !opts.id || !opts.timestamp || !opts.signatureHeader) return false;
  const ts = Number(opts.timestamp);
  const now = opts.nowSec ?? Date.now() / 1000;
  if (!Number.isFinite(ts) || Math.abs(now - ts) > SVIX_MAX_SKEW_SEC) return false;
  const signed = `${opts.id}.${opts.timestamp}.${opts.body}`;
  const expected = createHmac("sha256", svixKey(opts.secret)).update(signed).digest("base64");
  return opts.signatureHeader.split(" ").some((part) => {
    const value = part.replace(/^v1,/i, "").trim();
    return value ? safeEqual(value, expected) : false;
  });
}

export function verifySharedSecret(provided: string | undefined, expected: string | undefined) {
  if (!expected || !provided) return false;
  return safeEqual(provided, expected);
}
