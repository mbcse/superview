export class ParallelTransientError extends Error {
  status?: number;
  runId?: string;
  constructor(message: string, opts?: { status?: number; runId?: string }) {
    super(message);
    this.name = "ParallelTransientError";
    this.status = opts?.status;
    this.runId = opts?.runId;
  }
}

export class ParallelCreditsError extends Error {
  status = 402;
  constructor(message: string) {
    super(message);
    this.name = "ParallelCreditsError";
  }
}

let disabledUntil = 0;

export function markParallelUnavailable(ms = 30 * 60_000) {
  disabledUntil = Date.now() + ms;
}

export function parallelAvailable() {
  return Date.now() >= disabledUntil;
}

export function isCreditsError(err: unknown) {
  if (err instanceof ParallelCreditsError) return true;
  const status = err instanceof ParallelTransientError ? err.status : undefined;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return status === 402 || /insufficient credit|billing details|check your plan|payment required/i.test(msg);
}

export function retryDelayMs(attempt: number, status?: number) {
  const base = status === 429 || status === 403 ? 8_000 : 2_000;
  return Math.min(base * 3 ** attempt, 90_000);
}

export function isRetryableStatus(status: number, body = "") {
  if (status === 402 || /insufficient credit|billing details/i.test(body)) return false;
  if ([408, 409, 425, 429, 500, 502, 503, 504].includes(status)) return true;
  if (status === 403 && /rate|capacity|limit/i.test(body)) return true;
  return false;
}

export function isRetryableError(err: unknown) {
  if (isCreditsError(err)) return false;
  if (err instanceof ParallelTransientError) return true;
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /timed out|ECONNRESET|ETIMEDOUT|fetch failed|network|429|rate limit|capacity|503|502|504|overloaded/i.test(msg);
}

export function waitMsFromHeaders(headers: Headers, attempt: number, status?: number) {
  const ra = headers.get("retry-after");
  if (ra) {
    const sec = Number(ra);
    if (Number.isFinite(sec)) return Math.min(Math.max(1_000, sec * 1000), 90_000);
    const when = Date.parse(ra);
    if (Number.isFinite(when)) return Math.min(Math.max(1_000, when - Date.now()), 90_000);
  }
  return retryDelayMs(attempt, status);
}

export function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

export async function fetchWithRetry(url: string, init: RequestInit, tries = 5): Promise<Response> {
  let last: Error | undefined;
  for (let attempt = 0; attempt < tries; attempt++) {
    try {
      const res = await fetch(url, init);
      if (res.ok) return res;
      const body = await res.text().catch(() => "");
      if (res.status === 402 || /insufficient credit|billing details/i.test(body)) {
        markParallelUnavailable();
        throw new ParallelCreditsError(`HTTP ${res.status} Parallel credits empty`);
      }
      const err = isRetryableStatus(res.status, body)
        ? new ParallelTransientError(`HTTP ${res.status} ${body.slice(0, 160)}`, { status: res.status })
        : new Error(`HTTP ${res.status} ${body.slice(0, 160)}`);
      if (attempt < tries - 1 && err instanceof ParallelTransientError) {
        await sleep(waitMsFromHeaders(res.headers, attempt, res.status));
        last = err;
        continue;
      }
      throw err;
    } catch (e) {
      if (!(e instanceof ParallelTransientError) && e instanceof Error && !isRetryableError(e)) throw e;
      last = e instanceof Error ? e : new Error(String(e));
      if (attempt < tries - 1 && isRetryableError(last)) {
        await sleep(retryDelayMs(attempt));
        continue;
      }
      throw last;
    }
  }
  throw last ?? new ParallelTransientError("fetch retry exhausted");
}
