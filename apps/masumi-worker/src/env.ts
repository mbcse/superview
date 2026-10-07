function num(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function bool(name: string, fallback: boolean) {
  const raw = process.env[name]?.trim()?.toLowerCase();
  if (raw == null || raw === "") return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

export const workerEnv = {
  port: num("PORT", 8090),
  host: process.env.HOST?.trim() || "0.0.0.0",
  agentUrl: (process.env.MASUMI_AGENT_URL?.trim() || "http://127.0.0.1:8080").replace(/\/$/, ""),
  mockPayments: bool("MOCK_PAYMENTS", true),
  paymentServiceUrl: (process.env.PAYMENT_SERVICE_URL?.trim() || "").replace(/\/$/, ""),
  paymentApiKey: process.env.PAYMENT_API_KEY?.trim() || "",
  network: process.env.NETWORK?.trim() || "Preprod",
  paymentPollMs: num("PAYMENT_POLL_MS", 3000),
  paymentTimeoutMs: num("PAYMENT_TIMEOUT_MS", 900_000),
  submitResultHash: bool("SUBMIT_RESULT_HASH", true),
  agentPollMs: num("AGENT_POLL_MS", 2000),
  agentTimeoutMs: num("AGENT_TIMEOUT_MS", 900_000)
};
