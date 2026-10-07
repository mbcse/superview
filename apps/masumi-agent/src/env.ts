import { isAbsolute, resolve } from "node:path";

function num(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const agentEnv = {
  port: num("PORT", 8080),
  host: process.env.HOST?.trim() || "0.0.0.0",
  superviewApiUrl: (process.env.SUPERVIEW_API_URL?.trim() || "https://api.superview.fun").replace(/\/$/, ""),
  demoUser: process.env.SUPERVIEW_DEMO_USER?.trim() || "masumi-agent",
  authToken: process.env.SUPERVIEW_AUTH_TOKEN?.trim() || "",
  network: process.env.NETWORK?.trim() || "",
  agentIdentifier: process.env.AGENT_IDENTIFIER?.trim() || "",
  paymentServiceUrl: (process.env.PAYMENT_SERVICE_URL?.trim() || "").replace(/\/$/, ""),
  paymentApiKey: process.env.PAYMENT_API_KEY?.trim() || "",
  sellerVkey: process.env.SELLER_VKEY?.trim() || "",
  jobsPath: (() => {
    const raw = process.env.MASUMI_JOBS_PATH?.trim() || "data/masumi-jobs.json";
    return isAbsolute(raw) ? raw : resolve(process.cwd(), raw);
  })(),
  researchPollMs: num("RESEARCH_POLL_MS", 2000),
  researchTimeoutMs: num("RESEARCH_TIMEOUT_MS", 600_000),
  paymentPollMs: num("PAYMENT_POLL_MS", 5000),
  payWindowMs: num("PAY_WINDOW_MS", 60 * 60 * 1000)
};

export function assertAgentReady() {
  const missing = [
    ["PAYMENT_SERVICE_URL", agentEnv.paymentServiceUrl],
    ["PAYMENT_API_KEY", agentEnv.paymentApiKey],
    ["AGENT_IDENTIFIER", agentEnv.agentIdentifier],
    ["SELLER_VKEY", agentEnv.sellerVkey],
    ["NETWORK", agentEnv.network],
    ["SUPERVIEW_API_URL", agentEnv.superviewApiUrl]
  ].filter(([, value]) => !value);
  if (missing.length) {
    throw new Error(`missing_env:${missing.map(([name]) => name).join(",")}`);
  }
  if (agentEnv.network !== "Preprod" && agentEnv.network !== "Mainnet") {
    throw new Error("NETWORK_must_be_Preprod_or_Mainnet");
  }
}
