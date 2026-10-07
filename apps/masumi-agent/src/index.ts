import express from "express";
import { agentEnv } from "./env.js";
import { createMip003Router } from "./mip003.js";

const app = express();
app.use(express.json({ limit: "1mb" }));
app.use(createMip003Router());

app.use((_req, res) => {
  res.status(404).json({ error: "not_found" });
});

app.listen(agentEnv.port, agentEnv.host, () => {
  console.log(
    `[masumi-agent] MIP-003 listening on http://${agentEnv.host}:${agentEnv.port} → research ${agentEnv.superviewApiUrl}`
  );
});
