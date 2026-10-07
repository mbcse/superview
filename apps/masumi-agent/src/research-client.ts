import { agentEnv } from "./env.js";

export type ResearchStart = {
  takeId: string;
  runId: string;
  status: string;
  reused?: boolean;
};

export type ResearchSnapshot = {
  status: string;
  stage?: string;
  portfolio?: unknown;
  spec?: unknown;
  run?: unknown;
};

function authHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json"
  };
  if (agentEnv.authToken) {
    headers.authorization = agentEnv.authToken.startsWith("Bearer ")
      ? agentEnv.authToken
      : `Bearer ${agentEnv.authToken}`;
  } else {
    headers["x-demo-user"] = agentEnv.demoUser;
  }
  return headers;
}

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { raw: text };
  }
}

export async function startResearch(sentence: string, horizon?: string): Promise<ResearchStart> {
  const body: Record<string, unknown> = {
    sentence: sentence.trim().slice(0, 280),
    world: "STOCKS",
    lens: "BELIEF"
  };
  if (horizon?.trim()) body.horizon = horizon.trim();

  const res = await fetch(`${agentEnv.superviewApiUrl}/v1/research`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body)
  });
  const data = (await readJson(res)) as ResearchStart & { error?: unknown };
  if (!res.ok) {
    throw new Error(`research_start_failed:${res.status}:${JSON.stringify(data.error ?? data)}`);
  }
  if (!data.runId) throw new Error("research_start_missing_runId");
  return data;
}

export async function getResearch(runId: string): Promise<ResearchSnapshot> {
  const res = await fetch(`${agentEnv.superviewApiUrl}/v1/research/${encodeURIComponent(runId)}`, {
    headers: authHeaders()
  });
  const data = (await readJson(res)) as {
    run?: { status?: string; stage?: string };
    portfolio?: unknown;
    spec?: unknown;
    error?: unknown;
  };
  if (!res.ok) {
    throw new Error(`research_get_failed:${res.status}:${JSON.stringify(data.error ?? data)}`);
  }
  return {
    status: String(data.run?.status ?? ""),
    stage: data.run?.stage,
    portfolio: data.portfolio,
    spec: data.spec,
    run: data.run
  };
}

export async function waitForDraft(runId: string): Promise<ResearchSnapshot> {
  const started = Date.now();
  for (;;) {
    const snap = await getResearch(runId);
    if (snap.status === "DRAFT" || snap.status === "DEEP_DONE") return snap;
    if (snap.status === "FAILED" || snap.status === "REFUSED") {
      throw new Error(`research_ended:${snap.status}`);
    }
    if (Date.now() - started > agentEnv.researchTimeoutMs) {
      throw new Error("research_timeout");
    }
    await new Promise((r) => setTimeout(r, agentEnv.researchPollMs));
  }
}
