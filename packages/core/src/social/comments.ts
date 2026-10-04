const INFRA_MESSAGE = /invalid token|token is malformed|unauthenticated|permission denied|illegal base64/i;
const PROMPT_LEAK =
  /Write an investment memo|You are the agent that runs this view|Comment to reply to:|Basket and recent decisions:|\{\{(view|interpretation|holdings|evidence|basket|research|thread|comment)\}\}/i;

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

export function isPromptLeakBody(body: unknown) {
  if (typeof body !== "string") return false;
  const t = body.trim();
  if (!t) return false;
  if (PROMPT_LEAK.test(t)) return true;
  return (t.startsWith("{") || t.startsWith("[")) && /"prompt"\s*:/.test(t);
}

export function publicCommentBody(body: unknown): string | null {
  if (typeof body !== "string") return null;
  const t = body.trim();
  if (!t || isInfraCommentBody(t) || isPromptLeakBody(t)) return null;
  if (t.startsWith("{") || t.startsWith("[")) {
    try {
      const j = JSON.parse(t) as Record<string, unknown>;
      const candidate = [j.result, j.output, j.text, j.memo, j.content].find((v) => typeof v === "string");
      return typeof candidate === "string" ? publicCommentBody(candidate) : null;
    } catch {
      return null;
    }
  }
  return t.slice(0, 8000);
}

export function isAgentMemoDump<T extends { body?: unknown; authorType?: string | null; isPinned?: boolean | null }>(row: T) {
  if (row.authorType !== "AGENT") return false;
  if (row.isPinned) return true;
  const body = typeof row.body === "string" ? row.body : "";
  return body.length > 4000 || /^#\s*INVESTMENT MEMO/i.test(body.trim());
}

export function visibleComments<T extends { body?: unknown; status?: string | null }>(rows: T[]) {
  return rows.filter(
    (c) => (c.status == null || c.status === "VISIBLE") && !isInfraCommentBody(c.body) && !isPromptLeakBody(c.body)
  );
}

export function threadComments<T extends { body?: unknown; status?: string | null; authorType?: string | null; isPinned?: boolean | null }>(
  rows: T[]
) {
  return visibleComments(rows).filter((c) => !isAgentMemoDump(c));
}
