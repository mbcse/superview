import express from "express";
import { agentEnv, assertAgentReady } from "./env.js";
import { loadJobs, resumeJobs } from "./jobs.js";
import { createMip003Router } from "./mip003.js";

try {
  assertAgentReady();
} catch (err) {
  console.error("[masumi-agent] refused to boot:", err instanceof Error ? err.message : err);
  process.exit(1);
}
loadJobs();
resumeJobs();

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    console.log(`[masumi-agent] ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - start}ms`);
  });
  next();
});
app.use(createMip003Router());

app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

app.listen(agentEnv.port, agentEnv.host, () => {
  console.log(
    `[masumi-agent] MIP-003 ${agentEnv.network} http://${agentEnv.host}:${agentEnv.port} research=${agentEnv.superviewApiUrl} payments=${agentEnv.paymentServiceUrl}`
  );
});
