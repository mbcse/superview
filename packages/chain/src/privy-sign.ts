import { createHash, createPrivateKey, sign as nodeSign, verify as nodeVerify } from "node:crypto";

export type PrivySignInput = {
  method: string;
  url: string;
  body: unknown;
  privyAppId: string;
  authorizationKey: string;
};

function stripWalletAuth(raw: string) {
  return raw.replace(/^wallet-auth:/i, "").trim();
}

function authorizationPem(raw: string) {
  const key = stripWalletAuth(raw);
  if (key.includes("BEGIN")) return key;
  const der = Buffer.from(key, "base64");
  const b64 = der.toString("base64").match(/.{1,64}/g)?.join("\n") ?? "";
  return `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----`;
}

export function canonicalPrivyPayload(input: Omit<PrivySignInput, "authorizationKey">) {
  return JSON.stringify({
    version: 1,
    method: input.method,
    url: input.url,
    body: input.body,
    headers: { "privy-app-id": input.privyAppId }
  });
}

export function privyAuthorizationSignature(input: PrivySignInput) {
  const payload = canonicalPrivyPayload(input);
  const pem = authorizationPem(input.authorizationKey);
  const key = createPrivateKey({ key: pem, format: "pem" });
  const signature = nodeSign("SHA256", Buffer.from(payload), { key, dsaEncoding: "der" });
  return signature.toString("base64");
}

export function verifyPrivyAuthorizationSignature(input: PrivySignInput, signatureB64: string) {
  const payload = canonicalPrivyPayload(input);
  const pem = authorizationPem(input.authorizationKey);
  const key = createPrivateKey({ key: pem, format: "pem" });
  return nodeVerify("SHA256", Buffer.from(payload), { key, dsaEncoding: "der" }, Buffer.from(signatureB64, "base64"));
}

export function assertNotRawAuthorizationKey(signature: string, authorizationKey: string) {
  const raw = stripWalletAuth(authorizationKey);
  if (!signature || signature === authorizationKey || signature === raw) {
    throw new Error("privy_signature_is_raw_key");
  }
}

export function privyWalletRpcUrl(privyWalletId: string) {
  return `https://api.privy.io/v1/wallets/${privyWalletId}/rpc`;
}

export function hashIdempotency(parts: string[]) {
  return createHash("sha256").update(parts.join(":")).digest("hex").slice(0, 32);
}

export function receiptFillStatus(rec: { status?: string } | null) {
  return rec?.status === "success" ? "FILLED" : "FAILED";
}
