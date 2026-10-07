import express from "express";
import { workerEnv } from "./env.js";
import { processPaidTask } from "./process-task.js";

/**
 * Local control plane for demos / Sokosumi CLI glue.
 * Sokosumi UI remains the shop; this service waits for Masumi escrow then runs research.
 */
const app = express();
app.use(express.json({ limit: "1mb" }));

const recent = new Map<string, unknown>();

app.get("/health", (_req, res) => {
  res.json({
    ok: true,
    service: "masumi-worker",
    mockPayments: workerEnv.mockPayments,
    agentUrl: workerEnv.agentUrl,
    paymentServiceUrl: workerEnv.paymentServiceUrl || null
  });
});

/**
 * POST /v1/tasks/run
 * Body: { taskId, belief, horizon?, paymentId?, purchaserId? }
 *
 * Paid track: set MOCK_PAYMENTS=false and pass paymentId from Masumi/Sokosumi.
 * Local smoke: MOCK_PAYMENTS=true (default) skips escrow wait.
 */
app.post("/v1/tasks/run", async (req, res) => {
  const taskId = String(req.body?.taskId ?? req.body?.task_id ?? "").trim();
  const belief = String(req.body?.belief ?? req.body?.sentence ?? req.body?.prompt ?? "").trim();
  const horizon = req.body?.horizon != null ? String(req.body.horizon).trim() : undefined;
  const paymentId = req.body?.paymentId != null ? String(req.body.paymentId).trim() : undefined;
  const purchaserId = req.body?.purchaserId != null ? String(req.body.purchaserId).trim() : undefined;

  if (!taskId) return res.status(400).json({ error: "taskId_required" });
  if (!belief) return res.status(400).json({ error: "belief_required" });

  try {
    const result = await processPaidTask({
      taskId,
      belief,
      horizon: horizon || undefined,
      paymentId,
      purchaserId
    });
    recent.set(taskId, result);
    res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message, taskId });
  }
});

app.get("/v1/tasks/:taskId", (req, res) => {
  const hit = recent.get(String(req.params.taskId));
  if (!hit) return res.status(404).json({ error: "not_found" });
  res.json(hit);
});

app.listen(workerEnv.port, workerEnv.host, () => {
  console.log(
    `[masumi-worker] listening on http://${workerEnv.host}:${workerEnv.port} agent=${workerEnv.agentUrl} mockPayments=${workerEnv.mockPayments}`
  );
});
