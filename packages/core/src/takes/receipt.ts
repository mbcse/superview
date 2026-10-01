import { createHash } from "node:crypto";

export function canonicalReceipt(payload: unknown): { json: string; sha256: string } {
  const json = stableStringify(payload);
  return { json, sha256: createHash("sha256").update(json).digest("hex") };
}

export function verifyReceipt(payload: unknown, sha256: string): boolean {
  return canonicalReceipt(payload).sha256 === sha256;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(",")}}`;
}
