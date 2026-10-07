import { pushAlert } from "./alerts.js";
import { breakerFail, breakerOk, breakerSuccess } from "./breaker.js";
import { LIMITS, waitToken } from "./limiter.js";

type LimitKey = keyof typeof LIMITS;

export async function providerFetch(
  provider: LimitKey,
  url: string,
  init: RequestInit = {}
): Promise<Response | null> {
  if (!breakerOk(provider)) return null;
  const lim = LIMITS[provider];
  const ok = await waitToken(provider, lim.rps, lim.burst);
  if (!ok) return null;
  try {
    const res = await fetch(url, {
      ...init,
      headers: { accept: "application/json", ...(init.headers ?? {}) }
    });
    if (res.status === 429 || res.status >= 500) {
      if (res.status === 429) pushAlert("http_429", `${provider} ${url}`);
      const reset = Number(res.headers.get("x-ratelimit-reset") ?? res.headers.get("X-RateLimit-Reset") ?? 0);
      breakerFail(provider, reset > 1_000_000_000 ? reset * 1000 : Date.now() + 15_000);
      return null;
    }
    breakerSuccess(provider);
    return res;
  } catch {
    breakerFail(provider);
    return null;
  }
}

export function jupiterHeaders(): Record<string, string> {
  const key = process.env.JUPITER_API_KEY?.trim();
  return key ? { "x-api-key": key } : {};
}

export function bagsHeaders(): Record<string, string> {
  const key = process.env.BAGS_API_KEY?.trim();
  return key ? { "x-api-key": key } : {};
}
