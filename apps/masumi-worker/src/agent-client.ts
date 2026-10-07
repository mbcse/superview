import { workerEnv } from "./env.js";

export type AgentJobStart = { job_id: string; id?: string; status: string };
export type AgentJobStatus = {
  job_id?: string;
  id?: string;
  status: string;
  result?: string;
  resultHash?: string;
  error?: string;
  takeId?: string;
  runId?: string;
};

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

export async function startAgentJob(belief: string, horizon?: string, purchaserId?: string) {
  const res = await fetch(`${workerEnv.agentUrl}/start_job`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      identifier_from_purchaser: purchaserId || `sv-${Date.now().toString(16)}`,
      input_data: {
        belief,
        ...(horizon ? { horizon } : {})
      }
    })
  });
  const data = (await readJson(res)) as AgentJobStart & { error?: unknown };
  if (!res.ok) throw new Error(`agent_start_failed:${res.status}:${JSON.stringify(data)}`);
  const jobId = data.job_id || data.id;
  if (!jobId) throw new Error("agent_missing_job_id");
  return { ...data, job_id: jobId };
}

export async function getAgentStatus(jobId: string) {
  const res = await fetch(`${workerEnv.agentUrl}/status?job_id=${encodeURIComponent(jobId)}`);
  const data = (await readJson(res)) as AgentJobStatus;
  if (!res.ok) throw new Error(`agent_status_failed:${res.status}:${JSON.stringify(data)}`);
  return data;
}

export async function waitForAgentResult(jobId: string) {
  const started = Date.now();
  for (;;) {
    const st = await getAgentStatus(jobId);
    if (st.status === "completed") {
      if (!st.result) throw new Error("agent_completed_without_result");
      return st;
    }
    if (st.status === "failed") {
      throw new Error(`agent_failed:${st.error ?? "unknown"}`);
    }
    if (Date.now() - started > workerEnv.agentTimeoutMs) {
      throw new Error("agent_timeout");
    }
    await new Promise((r) => setTimeout(r, workerEnv.agentPollMs));
  }
}
