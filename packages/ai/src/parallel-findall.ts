import { ResearchConfigError } from "./errors.js";
import { fetchWithRetry, isRetryableStatus, sleep, waitMsFromHeaders } from "./parallel-retry.js";

export type ParallelCandidate = {
  name: string;
  url?: string;
  description?: string;
  matchStatus: string;
};

type FindAllRun = {
  findall_id: string;
  status: { status: string; is_active: boolean };
};

type FindAllResult = {
  run: FindAllRun;
  candidates?: ParallelCandidate[];
};

function apiKey() {
  const key = process.env.PARALLEL_API_KEY?.trim();
  if (!key) throw new ResearchConfigError("Set PARALLEL_API_KEY in .env for real company research (no mock).");
  return key;
}

const headers = (key: string) => ({
  "x-api-key": key,
  "content-type": "application/json",
  "parallel-beta": "findall-2025-09-15"
});

function matchedOf(json: FindAllResult & { candidates?: Array<{ name: string; url?: string; description?: string; match_status: string }> }) {
  const raw = (json.candidates ?? []) as Array<{
    name: string;
    url?: string;
    description?: string;
    match_status: string;
  }>;
  return raw
    .filter((c) => c.match_status === "matched" || c.match_status === "generated")
    .map((c) => ({
      name: c.name,
      url: c.url,
      description: c.description,
      matchStatus: c.match_status
    }));
}

export async function runParallelFindAll(
  objective: string,
  matchLimit = 12,
  opts?: { resumeId?: string; onStart?: (id: string) => void | Promise<void>; timeoutMs?: number }
): Promise<ParallelCandidate[]> {
  const key = apiKey();
  let id = opts?.resumeId?.trim() || "";
  if (!id) {
    const start = await fetchWithRetry("https://api.parallel.ai/v1beta/findall/runs", {
      method: "POST",
      headers: headers(key),
      body: JSON.stringify({
        objective,
        entity_type: "companies",
        match_conditions: [{ name: "thesis_fit", description: objective }],
        generator: "core",
        match_limit: matchLimit
      })
    });
    const started = (await start.json()) as { findall_id: string };
    id = started.findall_id;
    if (!id) throw new Error("Parallel FindAll missing id");
    await opts?.onStart?.(id);
  } else {
    await opts?.onStart?.(id);
  }

  const deadline = Date.now() + (opts?.timeoutMs ?? 50_000);
  let pollAttempt = 0;
  while (Date.now() < deadline) {
    await sleep(2500);
    const res = await fetch(`https://api.parallel.ai/v1beta/findall/runs/${id}/result`, {
      headers: headers(key)
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      if (isRetryableStatus(res.status, body)) {
        await sleep(waitMsFromHeaders(res.headers, pollAttempt++, res.status));
        continue;
      }
      throw new Error(`Parallel FindAll result ${res.status}`);
    }
    const json = (await res.json()) as FindAllResult & {
      candidates?: Array<{ name: string; url?: string; description?: string; match_status: string }>;
    };
    const active = json.run?.status?.is_active ?? true;
    const matched = matchedOf(json);
    if (!active && matched.length > 0) return matched;
    if (!active && json.run?.status?.status === "completed") return matched;
  }
  return [];
}
