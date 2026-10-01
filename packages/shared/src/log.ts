function clip(value: unknown, max = 96) {
  const raw = typeof value === "string" ? value : JSON.stringify(value);
  if (!raw) return "";
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
}

function kv(extra?: Record<string, unknown>) {
  if (!extra) return "";
  const parts = Object.entries(extra)
    .filter(([, v]) => v !== undefined && v !== "")
    .map(([k, v]) => `${k}=${clip(v)}`);
  return parts.length ? `  ${parts.join("  ")}` : "";
}

export function formatErr(err: unknown): string {
  if (!err) return "unknown";
  if (typeof err === "string") return clip(err, 220);
  if (err instanceof Error) {
    const extra = err as Error & { data?: { error?: { message?: string } }; cause?: unknown };
    const nested = extra.data?.error?.message;
    const cause = extra.cause instanceof Error ? extra.cause.message : undefined;
    const joined = [extra.message, nested, cause].filter((p, i, a) => p && a.indexOf(p) === i).join(" · ");
    const arg = joined.match(/Argument `[^`]+`[^]*?(?:Expected [^.]+\.|invalid\.)/i);
    const useful = arg ? arg[0] : joined;
    return clip(useful.replace(/Value: \{[\s\S]*\}$/, "schema mismatch").replace(/\s+/g, " "), 220);
  }
  try {
    return clip(err, 200);
  } catch {
    return "unknown";
  }
}

export function log(scope: string, event: string, extra?: Record<string, unknown>) {
  console.log(`${scope.padEnd(8)} ${event}${kv(extra)}`);
}

export function logError(scope: string, event: string, err: unknown, extra?: Record<string, unknown>) {
  console.error(`${scope.padEnd(8)} ${event}  ${formatErr(err)}${kv(extra)}`);
}
