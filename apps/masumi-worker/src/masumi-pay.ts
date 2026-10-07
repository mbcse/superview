import { workerEnv } from "./env.js";

/**
 * Payment status source of truth = Masumi Payment Service (MPS).
 * This worker only OBSERVES escrow state. It does not write SuperView payment tables.
 *
 * When MOCK_PAYMENTS=true (local unpaid smoke test), we treat payment as already funded.
 * For the Cardano track demo: set MOCK_PAYMENTS=false and point PAYMENT_SERVICE_URL + key at MPS.
 */

export type PaymentCheck = {
  funded: boolean;
  raw?: unknown;
  source: "mock" | "mps" | "skip";
};

function mpsHeaders(): Record<string, string> {
  const headers: Record<string, string> = { accept: "application/json" };
  if (workerEnv.paymentApiKey) {
    // MPS admin/docs use token / x-api-key depending on version — send both safely.
    headers.token = workerEnv.paymentApiKey;
    headers["x-api-key"] = workerEnv.paymentApiKey;
  }
  return headers;
}

function looksFunded(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const o = payload as Record<string, unknown>;
  const status = String(o.status ?? o.onChainState ?? o.state ?? o.paymentStatus ?? "").toLowerCase();
  if (
    status.includes("fund") ||
    status.includes("paid") ||
    status.includes("complet") ||
    status.includes("confirm") ||
    status === "funds_locked" ||
    status === "result_submitted"
  ) {
    return true;
  }
  if (o.funded === true || o.isPaid === true || o.escrowFunded === true) return true;
  const nested = o.payment ?? o.data;
  if (nested && nested !== payload) return looksFunded(nested);
  return false;
}

/** One-shot check against MPS for a payment / purchase id. */
export async function checkEscrowFunded(paymentId: string): Promise<PaymentCheck> {
  if (workerEnv.mockPayments) {
    return { funded: true, source: "mock" };
  }
  if (!workerEnv.paymentServiceUrl) {
    throw new Error("PAYMENT_SERVICE_URL_required_when_MOCK_PAYMENTS_false");
  }
  if (!paymentId.trim()) {
    throw new Error("paymentId_required_when_MOCK_PAYMENTS_false");
  }

  const base = workerEnv.paymentServiceUrl;
  const paths = [
    `/payment/${encodeURIComponent(paymentId)}`,
    `/payments/${encodeURIComponent(paymentId)}`,
    `/purchase/${encodeURIComponent(paymentId)}`
  ];

  let last: unknown;
  for (const path of paths) {
    const res = await fetch(`${base}${path}`, { headers: mpsHeaders() });
    const text = await res.text();
    let json: unknown = text;
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      /* keep text */
    }
    last = json;
    if (res.ok && looksFunded(json)) {
      return { funded: true, raw: json, source: "mps" };
    }
    if (res.ok) {
      // Endpoint exists but not funded yet
      return { funded: false, raw: json, source: "mps" };
    }
  }
  return { funded: false, raw: last, source: "mps" };
}

/** Block until MPS reports funded (or mock). */
export async function waitUntilEscrowFunded(paymentId?: string): Promise<PaymentCheck> {
  if (workerEnv.mockPayments) {
    return { funded: true, source: "mock" };
  }
  const id = paymentId?.trim() || "";
  const started = Date.now();
  for (;;) {
    const check = await checkEscrowFunded(id);
    if (check.funded) return check;
    if (Date.now() - started > workerEnv.paymentTimeoutMs) {
      throw new Error("payment_escrow_timeout");
    }
    await new Promise((r) => setTimeout(r, workerEnv.paymentPollMs));
  }
}

/** Best-effort submit result hash to MPS after work completes. */
export async function submitResultHash(paymentId: string | undefined, resultHash: string) {
  if (workerEnv.mockPayments || !workerEnv.submitResultHash) {
    return { skipped: true as const };
  }
  if (!workerEnv.paymentServiceUrl || !paymentId?.trim()) {
    return { skipped: true as const, reason: "missing_payment_id_or_url" as const };
  }
  const body = { resultHash, hash: resultHash, paymentId };
  const paths = [
    `/payment/${encodeURIComponent(paymentId)}/submit-result`,
    `/payments/${encodeURIComponent(paymentId)}/submit-result`,
    `/submit-result`
  ];
  for (const path of paths) {
    const res = await fetch(`${workerEnv.paymentServiceUrl}${path}`, {
      method: "POST",
      headers: { ...mpsHeaders(), "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      return { skipped: false as const, status: res.status };
    }
  }
  return { skipped: true as const, reason: "submit_endpoints_failed" as const };
}
