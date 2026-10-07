import { createHash, randomUUID } from "node:crypto";
import { formatBrief } from "./format-brief.js";
import { startResearch, waitForDraft } from "./research-client.js";

export type JobStatus = "pending" | "running" | "completed" | "failed";

export type Job = {
  id: string;
  identifierFromPurchaser: string;
  belief: string;
  horizon?: string;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  takeId?: string;
  runId?: string;
  result?: string;
  resultHash?: string;
  error?: string;
};

const jobs = new Map<string, Job>();

export function getJob(id: string) {
  return jobs.get(id);
}

export function listJobs() {
  return [...jobs.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function touch(job: Job, patch: Partial<Job>) {
  Object.assign(job, patch, { updatedAt: new Date().toISOString() });
  jobs.set(job.id, job);
  return job;
}

export function hashResult(text: string) {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export function createJob(identifierFromPurchaser: string, belief: string, horizon?: string) {
  const job: Job = {
    id: randomUUID(),
    identifierFromPurchaser,
    belief: belief.trim(),
    horizon: horizon?.trim() || undefined,
    status: "pending",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  jobs.set(job.id, job);
  void runJob(job.id);
  return job;
}

async function runJob(jobId: string) {
  const job = jobs.get(jobId);
  if (!job) return;
  touch(job, { status: "running" });
  try {
    const started = await startResearch(job.belief, job.horizon);
    touch(job, { takeId: started.takeId, runId: started.runId });
    const snap = await waitForDraft(started.runId);
    const result = formatBrief({
      belief: job.belief,
      takeId: started.takeId,
      runId: started.runId,
      portfolio: snap.portfolio,
      spec: snap.spec
    });
    touch(job, {
      status: "completed",
      result,
      resultHash: hashResult(result)
    });
  } catch (err) {
    touch(job, {
      status: "failed",
      error: err instanceof Error ? err.message : String(err)
    });
  }
}
