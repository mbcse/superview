import { generateText, stepCountIs } from "ai";
import { log, logError } from "@takeandstake/shared";
import { hasOpenAI, modelIdOf, researchResponsesModel, webSearchTool } from "./llm.js";
import { fill, WEB_DILIGENCE_PROMPT, WEB_DISCOVER_PROMPT, WEB_NEWS_PROMPT } from "./prompts/index.js";

export type WebCompany = {
  symbol: string;
  legalName: string;
  sector?: string | null;
  known?: string;
};

const headingRe = /^#{1,3}\s+(.+)$/;

export function parseDiligenceNotes(text: string, symbols: string[]): Record<string, string> {
  const wanted = new Map<string, string>();
  for (const s of symbols) {
    wanted.set(s.toUpperCase(), s);
    wanted.set(s.replace(/^RH/i, "").toUpperCase(), s);
  }
  const out: Record<string, string> = {};

  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart >= 0 && jsonEnd > jsonStart) {
    try {
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1)) as Record<string, unknown>;
      for (const [k, v] of Object.entries(parsed)) {
        const canon = wanted.get(k.toUpperCase()) ?? wanted.get(k.replace(/^RH/i, "").toUpperCase());
        if (!canon) continue;
        if (typeof v === "string" && v.trim()) out[canon] = v.trim().slice(0, 4000);
        else if (v && typeof v === "object") out[canon] = JSON.stringify(v).slice(0, 4000);
      }
      if (Object.keys(out).length) return out;
    } catch {
      /* fall through to headings */
    }
  }

  const matchWanted = (raw: string) =>
    wanted.get(raw.toUpperCase()) ?? wanted.get(raw.replace(/^RH/i, "").toUpperCase());

  const lines = text.split(/\r?\n/);
  let current: string | null = null;
  const buckets = new Map<string, string[]>();
  for (const line of lines) {
    const heading = line.trim().match(headingRe);
    if (heading) {
      const tokens = heading[1].match(/[A-Za-z]{1,6}/g) ?? [];
      const canon = tokens.map((t) => matchWanted(t)).find(Boolean);
      if (canon) {
        current = canon;
        if (!buckets.has(canon)) buckets.set(canon, []);
        continue;
      }
    }
    const labeled = line.trim().match(/^([A-Za-z]{1,6})\s*[:—-]\s+(.*)$/);
    if (labeled) {
      const canon = matchWanted(labeled[1]);
      if (canon) {
        current = canon;
        if (!buckets.has(canon)) buckets.set(canon, []);
        if (labeled[2]) buckets.get(canon)!.push(labeled[2]);
        continue;
      }
    }
    if (current) buckets.get(current)!.push(line);
  }
  for (const [sym, parts] of buckets) {
    const note = parts.join("\n").trim();
    if (note) out[sym] = note.slice(0, 4000);
  }
  return out;
}

export async function runWebDiligence(input: {
  interpretation: string;
  mechanism: string;
  angles: unknown;
  companies: WebCompany[];
}): Promise<Record<string, string>> {
  const symbols = input.companies.map((c) => c.symbol);
  const model = researchResponsesModel();
  const started = Date.now();
  log("ai", "web-research", { model: modelIdOf(model), names: symbols.length });
  const result = await generateText({
    model: model as Parameters<typeof generateText>[0]["model"],
    tools: { web_search: webSearchTool() },
    stopWhen: stepCountIs(16),
    prompt: fill(WEB_DILIGENCE_PROMPT, {
      interpretation: input.interpretation,
      mechanism: input.mechanism,
      angles: JSON.stringify(input.angles),
      companies: JSON.stringify(
        input.companies.map((c) => ({
          symbol: c.symbol,
          name: c.legalName,
          sector: c.sector || undefined,
          known: c.known?.slice(0, 400) || undefined
        }))
      )
    })
  });
  const text = result.text;
  const notes = parseDiligenceNotes(text, symbols);
  if (!Object.keys(notes).length && text.trim()) {
    for (const s of symbols) notes[s] = text.slice(0, 4000);
  }
  log("ai", "web-research ok", { model: modelIdOf(model), ms: Date.now() - started, notes: Object.keys(notes).length });
  return notes;
}

export async function webSearchText(prompt: string, steps = 10): Promise<string> {
  if (!hasOpenAI()) throw new Error("OPENAI_API_KEY required for web search");
  const model = researchResponsesModel();
  const started = Date.now();
  const result = await generateText({
    model: model as Parameters<typeof generateText>[0]["model"],
    tools: { web_search: webSearchTool() },
    stopWhen: stepCountIs(steps),
    prompt
  });
  log("ai", "web-search", { model: modelIdOf(model), ms: Date.now() - started, chars: result.text.length });
  return result.text;
}

export type DiscoverHit = { name: string; description?: string };

export function parseDiscoverHits(text: string, limit = 8): DiscoverHit[] {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start < 0 || end <= start) return [];
  try {
    const rows = JSON.parse(text.slice(start, end + 1)) as unknown;
    if (!Array.isArray(rows)) return [];
    return rows
      .map((row) => {
        if (typeof row === "string") return { name: row };
        if (!row || typeof row !== "object") return null;
        const r = row as { name?: unknown; company?: unknown; description?: unknown };
        const name = String(r.name ?? r.company ?? "").trim();
        if (!name) return null;
        return { name, description: r.description ? String(r.description) : undefined };
      })
      .filter((x): x is DiscoverHit => Boolean(x))
      .slice(0, limit);
  } catch {
    return [];
  }
}

export async function runWebDiscover(objective: string, limit = 8): Promise<DiscoverHit[]> {
  const text = await webSearchText(
    fill(WEB_DISCOVER_PROMPT, { objective, limit: String(limit) }),
    8
  );
  return parseDiscoverHits(text, limit);
}

export async function runWebNews(view: string, symbols: string[]): Promise<string> {
  const text = await webSearchText(
    fill(WEB_NEWS_PROMPT, { view, names: symbols.join(", ") || "the holdings" }),
    8
  );
  return text.trim().slice(0, 6000);
}

export async function runWebDiligenceSafe(input: Parameters<typeof runWebDiligence>[0]): Promise<Record<string, string>> {
  try {
    return await runWebDiligence(input);
  } catch (e) {
    logError("ai", "web-research fail", e, { names: input.companies.length });
    throw e;
  }
}
