import { generateObject, NoObjectGeneratedError, TypeValidationError } from "ai";
import type { z } from "zod";
import { formatErr, log, logError } from "@takeandstake/shared";
import { modelIdOf, researchModel } from "./llm.js";

const RINGS = new Set(["direct", "indirect", "shared_interest", "hedge"]);

function tryParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    const tagged = text.match(/Value:\s*(\{[\s\S]*\})\.\s*Error message:/);
    if (tagged?.[1]) {
      try {
        return JSON.parse(tagged[1]);
      } catch {
        /* continue */
      }
    }
    const blob = text.match(/\{[\s\S]*\}/);
    if (blob?.[0]) {
      try {
        return JSON.parse(blob[0]);
      } catch {
        /* continue */
      }
    }
  }
  return undefined;
}

function nestedValue(err: unknown): unknown {
  if (TypeValidationError.isInstance(err) && "value" in err) return (err as TypeValidationError & { value: unknown }).value;
  const seen = new Set<unknown>();
  let cur: unknown = err;
  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    const o = cur as { value?: unknown; cause?: unknown; text?: string; message?: string };
    if (o.value && typeof o.value === "object") return o.value;
    if (typeof o.text === "string") {
      const parsed = tryParseJson(o.text);
      if (parsed) return parsed;
    }
    if (typeof o.message === "string") {
      const parsed = tryParseJson(o.message);
      if (parsed) return parsed;
    }
    cur = o.cause;
  }
  return undefined;
}

function holdingWeight(row: unknown): number | undefined {
  if (!row || typeof row !== "object") return undefined;
  const raw = (row as { weightPct?: unknown }).weightPct;
  const n = typeof raw === "number" ? raw : typeof raw === "string" ? Number(raw) : NaN;
  return Number.isFinite(n) ? n : undefined;
}

function unitScore(value: unknown, fallback = 0.5) {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return fallback;
  if (n > 1 && n <= 100) return Math.min(1, Math.max(0, n / 100));
  return Math.min(1, Math.max(0, n));
}

function asStringList(value: unknown, max = 6) {
  if (Array.isArray(value)) return value.map((x) => String(x).trim()).filter(Boolean).slice(0, max);
  if (typeof value === "string" && value.trim()) return [value.trim()].slice(0, max);
  return [];
}

function asText(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function repairAnalystItem(row: unknown) {
  if (!row || typeof row !== "object") return row;
  const o = row as Record<string, unknown>;
  const symbol = asText(o.symbol, "");
  if (!symbol) return null;
  return {
    ...o,
    symbol,
    exposurePurity: unitScore(o.exposurePurity),
    directness: unitScore(o.directness),
    quality: unitScore(o.quality),
    valuationRoom: unitScore(o.valuationRoom),
    riskPenalty: unitScore(o.riskPenalty, 0.4),
    confidence: unitScore(o.confidence),
    role: typeof o.role === "string" && RINGS.has(o.role) ? o.role : typeof o.ring === "string" && RINGS.has(o.ring) ? o.ring : "indirect",
    whyInBasket: asText(o.whyInBasket ?? o.why ?? o.rationale ?? o.reason, `${symbol} fits the view.`),
    bullPoints: asStringList(o.bullPoints),
    bearPoints: asStringList(o.bearPoints),
    whatWouldMakeUsSell: asText(o.whatWouldMakeUsSell ?? o.sellTrigger ?? o.exit, "The thesis no longer holds."),
    sourceIds: asStringList(o.sourceIds, 12)
  };
}

export function repairLlmValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(repairLlmValue);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if ((k === "ring" || k === "role") && (typeof v !== "string" || !RINGS.has(v))) out[k] = "indirect";
      else out[k] = repairLlmValue(v);
    }
    if (Array.isArray(out.holdings)) {
      out.holdings = out.holdings.filter((row) => {
        const w = holdingWeight(row);
        return w !== undefined && w >= 1;
      });
    }
    if (Array.isArray(out.items) && out.items.some((row) => row && typeof row === "object" && "symbol" in (row as object))) {
      out.items = out.items.map(repairAnalystItem).filter(Boolean);
    }
    return out;
  }
  return value;
}

export async function genObject<T extends z.ZodType>(opts: {
  model?: unknown;
  schema: T;
  prompt: string;
  label?: string;
}): Promise<z.infer<T>> {
  const model = opts.model ?? researchModel();
  const id = modelIdOf(model);
  const label = opts.label ?? "llm";
  const started = Date.now();
  log("ai", label, { model: id });

  const parse = (raw: unknown) => opts.schema.safeParse(repairLlmValue(raw));

  try {
    const { object } = await generateObject({
      model: model as Parameters<typeof generateObject>[0]["model"],
      schema: opts.schema,
      prompt: opts.prompt,
      maxRetries: 2,
      experimental_repairText: async ({ text, error }) => {
        const raw = tryParseJson(text) ?? nestedValue(error);
        if (!raw) return null;
        const next = parse(raw);
        return next.success ? JSON.stringify(next.data) : JSON.stringify(repairLlmValue(raw));
      }
    } as Parameters<typeof generateObject>[0]);
    const parsed = parse(object);
    if (!parsed.success) throw parsed.error;
    log("ai", `${label} ok`, { model: id, ms: Date.now() - started });
    return parsed.data;
  } catch (err) {
    const text = NoObjectGeneratedError.isInstance(err) ? err.text : undefined;
    const raw = nestedValue(err) ?? (typeof text === "string" ? tryParseJson(text) : undefined);
    if (raw) {
      const again = parse(raw);
      if (again.success) {
        log("ai", `${label} repaired`, { model: id, ms: Date.now() - started });
        return again.data;
      }
    }
    logError("ai", `${label} fail`, err, { model: id, ms: Date.now() - started });
    throw new Error(`${label} ${id}: ${formatErr(err)}`);
  }
}
