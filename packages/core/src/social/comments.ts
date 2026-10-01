const INFRA_MESSAGE = /invalid token|token is malformed|unauthenticated|permission denied|illegal base64/i;

export function isInfraCommentBody(body: unknown) {
  if (typeof body !== "string") return false;
  const t = body.trim();
  if (!t) return false;
  if (INFRA_MESSAGE.test(t) && /"code"\s*:/.test(t)) return true;
  if (!t.startsWith("{") && !t.startsWith("[")) return false;
  try {
    const j = JSON.parse(t) as { code?: unknown; message?: unknown; details?: unknown; error?: unknown };
    if (!j || typeof j !== "object") return false;
    const message = String(j.message ?? j.error ?? "");
    if (typeof j.code === "number" && Array.isArray(j.details) && INFRA_MESSAGE.test(message || t)) return true;
    if (typeof j.code === "number" && j.code >= 1 && j.code <= 16 && INFRA_MESSAGE.test(message)) return true;
    return false;
  } catch {
    return INFRA_MESSAGE.test(t) && t.includes("code");
  }
}

export function visibleComments<T extends { body?: unknown; status?: string | null }>(rows: T[]) {
  return rows.filter((c) => (c.status == null || c.status === "VISIBLE") && !isInfraCommentBody(c.body));
}
