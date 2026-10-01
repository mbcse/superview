import { ResearchConfigError } from "./errors.js";
import {
  ParallelTransientError,
  fetchWithRetry,
  isRetryableError,
  isRetryableStatus,
  retryDelayMs,
  sleep,
  waitMsFromHeaders
} from "./parallel-retry.js";

const TASK_URL = "https://api.parallel.ai/v1/tasks/runs";

function key() {
  const k = process.env.PARALLEL_API_KEY?.trim();
  if (!k) throw new ResearchConfigError("Set PARALLEL_API_KEY for company research.");
  return k;
}

function outputOf(json: {
  status?: string | { status?: string };
  output?: { content?: string } | string;
  result?: { content?: string };
}): { status?: string; text?: string } {
  const status = typeof json.status === "string" ? json.status : json.status?.status;
  const out = json.output;
  if (typeof out === "string") return { status, text: out };
  if (out && typeof out === "object" && "content" in out) return { status, text: String(out.content ?? "") };
  if (json.result?.content) return { status, text: json.result.content };
  return { status };
}

export async function runParallelTask(
  input: string,
  processor = "core",
  timeoutMs = 90_000,
  opts?: { resumeId?: string; onStart?: (id: string) => void | Promise<void> }
): Promise<string> {
  let id = opts?.resumeId?.trim() || "";
  if (!id) {
    const start = await fetchWithRetry(TASK_URL, {
      method: "POST",
      headers: { "x-api-key": key(), "content-type": "application/json" },
      body: JSON.stringify({ input, processor })
    });
    const created = (await start.json()) as { run_id?: string; id?: string };
    id = created.run_id ?? created.id ?? "";
    if (!id) throw new Error("Parallel Task missing run id");
    await opts?.onStart?.(id);
  } else {
    await opts?.onStart?.(id);
  }

  const deadline = Date.now() + timeoutMs;
  let pollAttempt = 0;
  while (Date.now() < deadline) {
    await sleep(2_000);
    try {
      const res = await fetch(`${TASK_URL}/${id}`, { headers: { "x-api-key": key() } });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        if (isRetryableStatus(res.status, body)) {
          await sleep(waitMsFromHeaders(res.headers, pollAttempt++, res.status));
          continue;
        }
        throw new ParallelTransientError(`Parallel Task poll ${res.status}`, { status: res.status, runId: id });
      }
      const json = (await res.json()) as Parameters<typeof outputOf>[0];
      const { status, text } = outputOf(json);
      if (status === "completed" || status === "succeeded") return text ?? JSON.stringify(json);
      if (status === "failed" || status === "error") {
        throw new Error(`Parallel Task failed: ${JSON.stringify(json)}`);
      }
    } catch (e) {
      if (e instanceof Error && e.message.startsWith("Parallel Task failed")) throw e;
      if (!isRetryableError(e)) throw e;
      await sleep(retryDelayMs(pollAttempt++));
    }
  }
  throw new ParallelTransientError("Parallel Task timed out", { runId: id });
}
