function num(name: string, fallback: number) {
  const raw = process.env[name]?.trim();
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

export const agentEnv = {
  port: num("PORT", 8080),
  host: process.env.HOST?.trim() || "0.0.0.0",
  superviewApiUrl: (process.env.SUPERVIEW_API_URL?.trim() || "http://127.0.0.1:4000").replace(/\/$/, ""),
  demoUser: process.env.SUPERVIEW_DEMO_USER?.trim() || "masumi-agent",
  authToken: process.env.SUPERVIEW_AUTH_TOKEN?.trim() || "",
  network: process.env.NETWORK?.trim() || "Preprod",
  agentIdentifier: process.env.AGENT_IDENTIFIER?.trim() || "",
  paymentServiceUrl: (process.env.PAYMENT_SERVICE_URL?.trim() || "").replace(/\/$/, ""),
  paymentApiKey: process.env.PAYMENT_API_KEY?.trim() || "",
  sellerVkey: process.env.SELLER_VKEY?.trim() || "",
  researchPollMs: num("RESEARCH_POLL_MS", 2000),
  researchTimeoutMs: num("RESEARCH_TIMEOUT_MS", 600_000)
};
