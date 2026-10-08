import { createHash } from "node:crypto";
import { agentEnv } from "./env.js";

export type PaymentDeadlines = {
  payByTime: number;
  submitResultTime: number;
  unlockTime: number;
  externalDisputeUnlockTime: number;
};

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalJson(obj[key])}`).join(",")}}`;
}

export function sha256Hex(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function inputHash(inputData: unknown) {
  return sha256Hex(canonicalJson(inputData));
}

export function isPurchaserId(id: string) {
  return /^[0-9a-fA-F]{14,26}$/.test(id);
}

export function deadlinesFrom(nowMs: number, researchTimeoutMs: number, payWindowMs: number): PaymentDeadlines {
  const payBy = nowMs + payWindowMs;
  const submit = payBy + Math.max(researchTimeoutMs, 20 * 60 * 1000) + 10 * 60 * 1000;
  const unlock = submit + 30 * 60 * 1000;
  const dispute = unlock + 30 * 60 * 1000;
  return {
    payByTime: Math.floor(payBy / 1000),
    submitResultTime: Math.floor(submit / 1000),
    unlockTime: Math.floor(unlock / 1000),
    externalDisputeUnlockTime: Math.floor(dispute / 1000)
  };
}

export function toUnixSeconds(value: unknown, fallback: number) {
  if (typeof value === "number" && value > 1_000_000_000) {
    return value > 1_000_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value === "string") {
    if (/^\d+$/.test(value)) {
      const n = Number(value);
      if (n > 1_000_000_000_000) return Math.floor(n / 1000);
      if (n > 1_000_000_000) return n;
    }
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed) && parsed > 0) return Math.floor(parsed / 1000);
  }
  return fallback;
}

export function paymentAction(row: unknown) {
  if (!row || typeof row !== "object") return "";
  const record = row as Record<string, unknown>;
  const onChain = String(record.onChainState ?? "").trim();
  if (onChain) return onChain;
  const next = record.NextAction;
  if (typeof next === "string" && next) return next;
  if (next && typeof next === "object") {
    const action = String((next as Record<string, unknown>).requestedAction ?? "");
    if (action) return action;
  }
  return String(record.CurrentAction ?? "");
}

export function fundsAreLocked(action: string) {
  return action === "FundsLocked" || action === "ResultSubmitted" || action === "Completed";
}

export function paymentFailed(action: string) {
  return action === "RefundRequested" || action === "RefundAuthorized" || action === "Disputed";
}

function iso(unixSeconds: number) {
  return new Date(unixSeconds * 1000).toISOString();
}

function authHeaders() {
  return {
    accept: "application/json",
    "content-type": "application/json",
    token: agentEnv.paymentApiKey
  };
}

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return text ? (JSON.parse(text) as unknown) : {};
  } catch {
    return { raw: text };
  }
}

function paymentData(body: unknown) {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  const data = record.data;
  if (data && typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
  return record;
}

function paymentRows(body: unknown): unknown[] {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];
  const record = body as Record<string, unknown>;
  if (Array.isArray(record.data)) return record.data;
  const data = paymentData(body);
  if (Array.isArray(data.Payments)) return data.Payments;
  if (Array.isArray(data.payments)) return data.payments;
  if (data.blockchainIdentifier) return [data];
  return [];
}

export async function createPayment(input: {
  identifierFromPurchaser: string;
  inputHash: string;
  deadlines: PaymentDeadlines;
}) {
  const res = await fetch(`${agentEnv.paymentServiceUrl}/payment/`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      agentIdentifier: agentEnv.agentIdentifier,
      network: agentEnv.network,
      paymentSourceType: "Web3CardanoV2",
      supportedPaymentSourceIndex: 0,
      identifierFromPurchaser: input.identifierFromPurchaser,
      inputHash: input.inputHash,
      payByTime: iso(input.deadlines.payByTime),
      submitResultTime: iso(input.deadlines.submitResultTime),
      unlockTime: iso(input.deadlines.unlockTime),
      externalDisputeUnlockTime: iso(input.deadlines.externalDisputeUnlockTime)
    })
  });
  const body = await readJson(res);
  const data = paymentData(body);
  const blockchainIdentifier = String(data.blockchainIdentifier ?? "").trim();
  if (!res.ok || !blockchainIdentifier) {
    const detail =
      typeof (body as { error?: { message?: string } }).error?.message === "string"
        ? (body as { error: { message: string } }).error.message
        : JSON.stringify(body).slice(0, 300);
    throw new Error(`payment_create_failed:${res.status}:${detail}`);
  }
  return {
    blockchainIdentifier,
    payByTime: toUnixSeconds(data.payByTime, input.deadlines.payByTime),
    submitResultTime: toUnixSeconds(data.submitResultTime, input.deadlines.submitResultTime),
    unlockTime: toUnixSeconds(data.unlockTime, input.deadlines.unlockTime),
    externalDisputeUnlockTime: toUnixSeconds(data.externalDisputeUnlockTime, input.deadlines.externalDisputeUnlockTime)
  };
}

export async function findPayment(blockchainIdentifier: string) {
  const network = encodeURIComponent(agentEnv.network);
  const agent = encodeURIComponent(agentEnv.agentIdentifier);
  const urls = [
    `${agentEnv.paymentServiceUrl}/payment/?network=${network}&filterPaymentSourceType=Web3CardanoV2&filterAgentIdentifier=${agent}&limit=100`
  ];
  let lastStatus = 0;
  for (const url of urls) {
    const res = await fetch(url, { headers: authHeaders() });
    lastStatus = res.status;
    const body = await readJson(res);
    if (!res.ok) continue;
    const rows = paymentRows(body);
    const match = rows.find((row) => {
      if (!row || typeof row !== "object") return false;
      return String((row as Record<string, unknown>).blockchainIdentifier ?? "") === blockchainIdentifier;
    });
    if (match) return match;
  }
  if (lastStatus >= 400) throw new Error(`payment_lookup_failed:${lastStatus}`);
  return null;
}

export async function waitForFunds(blockchainIdentifier: string, payByTime: number) {
  for (;;) {
    try {
      const row = await findPayment(blockchainIdentifier);
      const action = paymentAction(row);
      if (fundsAreLocked(action)) return action;
      if (paymentFailed(action)) throw new Error(`payment_${action}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.startsWith("payment_") && !message.startsWith("payment_lookup")) throw err;
    }
    if (Date.now() / 1000 > payByTime + 120) throw new Error("payment_window_expired");
    await new Promise((resolve) => setTimeout(resolve, agentEnv.paymentPollMs));
  }
}

export async function submitResult(blockchainIdentifier: string, submitResultHash: string) {
  const res = await fetch(`${agentEnv.paymentServiceUrl}/payment/submit-result`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      network: agentEnv.network,
      blockchainIdentifier,
      submitResultHash
    })
  });
  if (!res.ok) throw new Error(`submit_result_failed:${res.status}`);
}
