export function isCreditsError(err: unknown) {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /insufficient credit|billing details|check your plan|payment required|HTTP 402/i.test(msg);
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
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return /timed out|ECONNRESET|ETIMEDOUT|fetch failed|network|429|rate limit|capacity|503|502|504|overloaded/i.test(msg);
}

export function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}
