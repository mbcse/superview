import { Router } from "express";
import { agentEnv } from "./env.js";
import { createJob, getJob } from "./jobs.js";

export const INPUT_SCHEMA = {
  input_data: [
    {
      id: "belief",
      type: "string",
      name: "Market belief",
      data: {
        description: "One-sentence market belief to turn into a Robinhood Chain stock-token basket brief.",
        placeholder: "AI infrastructure demand will outgrow cloud spend"
      }
    },
    {
      id: "horizon",
      type: "string",
      name: "Horizon (optional)",
      data: {
        description: "Optional investment horizon, e.g. 12-24m",
        required: false
      }
    }
  ]
};

function beliefFromInput(input: unknown): { belief: string; horizon?: string } {
  if (!input || typeof input !== "object") return { belief: "" };
  const o = input as Record<string, unknown>;
  const belief = String(o.belief ?? o.sentence ?? o.text ?? o.prompt ?? "").trim();
  const horizon = o.horizon != null ? String(o.horizon).trim() : undefined;
  return { belief, horizon: horizon || undefined };
}

export function createMip003Router() {
  const router = Router();

  router.get("/availability", (_req, res) => {
    res.json({
      status: "available",
      type: "masumi-agent",
      message: "SuperView Research Coworker",
      network: agentEnv.network,
      agentIdentifier: agentEnv.agentIdentifier || null,
      superviewApi: agentEnv.superviewApiUrl
    });
  });

  router.get("/input_schema", (_req, res) => {
    res.json(INPUT_SCHEMA);
  });

  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "masumi-agent" });
  });

  router.post("/start_job", (req, res) => {
    const identifierFromPurchaser = String(req.body?.identifier_from_purchaser ?? "").trim();
    if (!identifierFromPurchaser) {
      return res.status(400).json({ error: "identifier_from_purchaser_required" });
    }
    const { belief, horizon } = beliefFromInput(req.body?.input_data);
    if (!belief) {
      return res.status(400).json({ error: "belief_required", hint: "input_data.belief" });
    }
    const job = createJob(identifierFromPurchaser, belief, horizon);
    res.status(201).json({
      id: job.id,
      job_id: job.id,
      status: job.status,
      identifier_from_purchaser: job.identifierFromPurchaser
    });
  });

  router.get("/status", (req, res) => {
    const jobId = String(req.query.job_id ?? req.query.jobId ?? "").trim();
    if (!jobId) return res.status(400).json({ error: "job_id_required" });
    const job = getJob(jobId);
    if (!job) return res.status(404).json({ error: "not_found" });

    if (job.status === "completed") {
      return res.json({
        id: job.id,
        job_id: job.id,
        status: "completed",
        result: job.result,
        resultHash: job.resultHash,
        takeId: job.takeId,
        runId: job.runId
      });
    }
    if (job.status === "failed") {
      return res.json({
        id: job.id,
        job_id: job.id,
        status: "failed",
        error: job.error
      });
    }
    return res.json({
      id: job.id,
      job_id: job.id,
      status: job.status,
      takeId: job.takeId,
      runId: job.runId
    });
  });

  return router;
}
