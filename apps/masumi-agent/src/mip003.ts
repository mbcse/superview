import { Router } from "express";
import { agentEnv } from "./env.js";
import { getJob, openJob } from "./jobs.js";

export const INPUT_SCHEMA = {
  input_data: [
    {
      id: "belief",
      type: "string",
      name: "Market belief",
      data: {
        description: "One-sentence market belief to turn into a researched stock-token basket brief.",
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

function fieldValue(row: unknown) {
  if (!row || typeof row !== "object") return "";
  const o = row as Record<string, unknown>;
  return String(o.value ?? o.data ?? o.text ?? "").trim();
}

function beliefFromInput(input: unknown): { belief: string; horizon?: string } {
  if (Array.isArray(input)) {
    const byId = new Map<string, string>();
    for (const row of input) {
      if (!row || typeof row !== "object") continue;
      const id = String((row as Record<string, unknown>).id ?? "").trim();
      if (id) byId.set(id, fieldValue(row));
    }
    const belief = (byId.get("belief") || byId.get("sentence") || byId.get("text") || byId.get("prompt") || "").trim();
    const horizon = (byId.get("horizon") || "").trim();
    return { belief, horizon: horizon || undefined };
  }
  if (!input || typeof input !== "object") return { belief: "" };
  const o = input as Record<string, unknown>;
  const belief = String(o.belief ?? o.sentence ?? o.text ?? o.prompt ?? "").trim();
  const horizon = o.horizon != null ? String(o.horizon).trim() : undefined;
  return { belief, horizon: horizon || undefined };
}

function mipStart(job: {
  id: string;
  blockchainIdentifier: string;
  payByTime: number;
  submitResultTime: number;
  unlockTime: number;
  externalDisputeUnlockTime: number;
  identifierFromPurchaser: string;
  inputHash: string;
}) {
  return {
    id: job.id,
    job_id: job.id,
    blockchainIdentifier: job.blockchainIdentifier,
    payByTime: job.payByTime,
    submitResultTime: job.submitResultTime,
    unlockTime: job.unlockTime,
    externalDisputeUnlockTime: job.externalDisputeUnlockTime,
    agentIdentifier: agentEnv.agentIdentifier,
    sellerVKey: agentEnv.sellerVkey,
    identifierFromPurchaser: job.identifierFromPurchaser,
    input_hash: job.inputHash
  };
}

export function createMip003Router() {
  const router = Router();

  router.get("/availability", (_req, res) => {
    res.json({
      status: "available",
      type: "masumi-agent",
      message: "SuperView Research Coworker",
      network: agentEnv.network,
      agentIdentifier: agentEnv.agentIdentifier
    });
  });

  router.get("/input_schema", (_req, res) => {
    res.json(INPUT_SCHEMA);
  });

  router.get("/health", (_req, res) => {
    res.json({ ok: true, service: "masumi-agent" });
  });

  router.post("/start_job", async (req, res) => {
    const identifierFromPurchaser = String(
      req.body?.identifier_from_purchaser ?? req.body?.identifierFromPurchaser ?? ""
    ).trim();
    if (!identifierFromPurchaser) {
      return res.status(400).json({ error: "identifier_from_purchaser_required" });
    }
    let inputData: unknown = req.body?.input_data ?? {};
    if (typeof inputData === "string") {
      try {
        inputData = JSON.parse(inputData) as unknown;
      } catch {
        return res.status(400).json({ error: "input_data_invalid_json" });
      }
    }
    const { belief, horizon } = beliefFromInput(inputData);
    if (!belief) {
      return res.status(400).json({ error: "belief_required", hint: "input_data.belief" });
    }
    try {
      console.log("[masumi-agent] start_job", { identifierFromPurchaser, belief: belief.slice(0, 80) });
      const job = await openJob(identifierFromPurchaser, inputData, belief, horizon);
      res.json(mipStart(job));
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[masumi-agent] start_job failed", message);
      const code = message.startsWith("identifier_from_purchaser") || message.startsWith("missing_env") ? 400 : 500;
      res.status(code).json({ error: message });
    }
  });

  router.get("/status", (req, res) => {
    const jobId = String(req.query.job_id ?? req.query.jobId ?? "").trim();
    if (!jobId) return res.status(400).json({ error: "job_id_required" });
    const job = getJob(jobId);
    if (!job) return res.status(404).json({ error: "not_found" });

    if (job.status === "completed") {
      return res.json({
        status: "completed",
        result: job.result,
        resultHash: job.resultHash
      });
    }
    if (job.status === "failed") {
      return res.json({
        status: "failed",
        error: job.error
      });
    }
    return res.json({ status: job.status });
  });

  return router;
}
