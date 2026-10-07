import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { agentEnv } from "./env.js";
import { formatBrief } from "./format-brief.js";
import {
  createPayment,
  deadlinesFrom,
  findPayment,
  fundsAreLocked,
  inputHash,
  isPurchaserId,
  paymentAction,
  sha256Hex,
  submitResult,
  waitForFunds,
  type PaymentDeadlines
} from "./masumi-pay.js";
import { startResearch, waitForDraft } from "./research-client.js";

export type JobStatus = "awaiting_payment" | "running" | "completed" | "failed";

export type Job = {
  id: string;
  identifierFromPurchaser: string;
  belief: string;
  horizon?: string;
  inputHash: string;
  status: JobStatus;
  blockchainIdentifier: string;
  payByTime: number;
  submitResultTime: number;
  unlockTime: number;
  externalDisputeUnlockTime: number;
  createdAt: string;
  updatedAt: string;
  takeId?: string;
  runId?: string;
  result?: string;
  resultHash?: string;
  resultSubmitted?: boolean;
  error?: string;
};

const jobs = new Map<string, Job>();
const inflight = new Set<string>();

function persist() {
  const file = agentEnv.jobsPath;
  try {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, JSON.stringify([...jobs.values()], null, 2));
  } catch (err) {
    console.error("[masumi-agent] persist_failed", err);
  }
}

function touch(job: Job, patch: Partial<Job>) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  jobs.set(job.id, job);
  persist();
  return job;
}

export function getJob(id: string) {
  return jobs.get(id);
}

export function loadJobs() {
  try {
    const rows = JSON.parse(readFileSync(agentEnv.jobsPath, "utf8")) as Job[];
    if (!Array.isArray(rows)) return;
    for (const row of rows) {
      if (row?.id) jobs.set(row.id, row);
    }
  } catch {
    /* first boot */
  }
}

export function resumeJobs() {
  for (const job of jobs.values()) {
    if (job.status === "awaiting_payment" || job.status === "running") schedule(job.id);
  }
}

function schedule(jobId: string) {
  if (inflight.has(jobId)) return;
  inflight.add(jobId);
  void runJob(jobId).finally(() => inflight.delete(jobId));
}

export async function openJob(identifierFromPurchaser: string, inputData: unknown, belief: string, horizon?: string) {
  if (!isPurchaserId(identifierFromPurchaser)) {
    throw new Error("identifier_from_purchaser must be 14-26 hex characters");
  }
  const hash = inputHash(inputData);
  const deadlines: PaymentDeadlines = deadlinesFrom(Date.now(), agentEnv.researchTimeoutMs, agentEnv.payWindowMs);
  const payment = await createPayment({ identifierFromPurchaser, inputHash: hash, deadlines });
  const now = new Date().toISOString();
  const job: Job = {
    id: randomUUID(),
    identifierFromPurchaser,
    belief: belief.trim(),
    horizon: horizon?.trim() || undefined,
    inputHash: hash,
    status: "awaiting_payment",
    blockchainIdentifier: payment.blockchainIdentifier,
    payByTime: payment.payByTime,
    submitResultTime: payment.submitResultTime,
    unlockTime: payment.unlockTime,
    externalDisputeUnlockTime: payment.externalDisputeUnlockTime,
    createdAt: now,
    updatedAt: now
  };
  jobs.set(job.id, job);
  persist();
  schedule(job.id);
  return job;
}

async function runJob(jobId: string) {
  const job = jobs.get(jobId);
  if (!job || job.status === "completed" || job.status === "failed") return;
  try {
    if (job.status === "awaiting_payment") {
      const action = await waitForFunds(job.blockchainIdentifier, job.payByTime);
      if (action === "ResultSubmitted" || action === "Completed") {
        if (job.result) {
          touch(job, { status: "completed", resultSubmitted: true });
          return;
        }
        throw new Error("payment_already_settled");
      }
      touch(job, { status: "running" });
    }
    if (!job.runId) {
      const started = await startResearch(job.belief, job.horizon);
      touch(job, { status: "running", takeId: started.takeId, runId: started.runId });
    }
    if (!job.result) {
      const snap = await waitForDraft(job.runId!);
      const result = formatBrief({
        belief: job.belief,
        takeId: job.takeId,
        runId: job.runId,
        portfolio: snap.portfolio,
        spec: snap.spec
      });
      touch(job, { result, resultHash: sha256Hex(result) });
    }
    if (!job.resultSubmitted) {
      try {
        await submitResult(job.blockchainIdentifier, job.resultHash!);
      } catch (err) {
        const row = await findPayment(job.blockchainIdentifier);
        if (!fundsAreLocked(paymentAction(row)) || paymentAction(row) === "FundsLocked") {
          throw err;
        }
      }
      touch(job, { status: "completed", resultSubmitted: true });
    }
  } catch (err) {
    touch(job, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
