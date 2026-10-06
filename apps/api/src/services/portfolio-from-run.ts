import { constructPortfolio, type HoldingRole } from "@takeandstake/core";
import { DEFAULT_CASH_BPS, displaySymbol, MIN_HOLDINGS, TOTAL_BPS } from "@takeandstake/shared";

const RINGS = new Set<HoldingRole>(["direct", "indirect", "shared_interest", "hedge"]);

function asRole(v: unknown): HoldingRole {
  return typeof v === "string" && RINGS.has(v as HoldingRole) ? (v as HoldingRole) : "direct";
}

function num(v: unknown, fallback = 0.5) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export type RunCandidate = {
  resolvedTokenId: string | null;
  holdable: boolean;
  token: { symbol: string; isTradingHalt: boolean } | null;
  score: {
    exposure: unknown;
    confidence: unknown;
    rationale: string;
    whyInBasket?: string;
    role?: string | null;
    bullPoints?: unknown;
    bearPoints?: unknown;
  } | null;
};

export type RunForPortfolio = {
  thesis: { normalizedTake: string } | null;
  candidates: RunCandidate[];
  modelVersions: unknown;
};

type StoredHolding = {
  tokenId: string;
  symbol: string;
  actionId: string;
  weightBps: number;
  role?: HoldingRole;
  score?: number;
};

type StoredBasket = {
  cashBps: number;
  holdings: StoredHolding[];
};

function storedBasket(meta: unknown): StoredBasket | null {
  if (!meta || typeof meta !== "object") return null;
  const c = (meta as { constructed?: unknown }).constructed;
  if (!c || typeof c !== "object") return null;
  const cashBps = Number((c as { cashBps?: unknown }).cashBps);
  const holdings = (c as { holdings?: unknown }).holdings;
  if (!Array.isArray(holdings) || holdings.length < MIN_HOLDINGS) return null;
  const rows: StoredHolding[] = [];
  for (const h of holdings) {
    if (!h || typeof h !== "object") continue;
    const tokenId = String((h as { tokenId?: unknown }).tokenId ?? "");
    const symbol = String((h as { symbol?: unknown }).symbol ?? "");
    const weightBps = Number((h as { weightBps?: unknown }).weightBps);
    if (!tokenId || !symbol || !Number.isFinite(weightBps) || weightBps <= 0) continue;
    rows.push({
      tokenId,
      symbol,
      actionId: String((h as { actionId?: unknown }).actionId ?? "direct"),
      weightBps,
      role: asRole((h as { role?: unknown }).role),
      score: Number((h as { score?: unknown }).score) || undefined
    });
  }
  if (rows.length < MIN_HOLDINGS) return null;
  return { cashBps: Number.isFinite(cashBps) ? cashBps : DEFAULT_CASH_BPS, holdings: rows };
}

function pmWeights(meta: unknown): Map<string, number> {
  const map = new Map<string, number>();
  if (!meta || typeof meta !== "object") return map;
  const holdings = (meta as { pm?: { holdings?: Array<{ symbol?: string; weightPct?: number }> } }).pm?.holdings;
  if (!Array.isArray(holdings)) return map;
  for (const h of holdings) {
    const sym = h.symbol?.toUpperCase();
    if (!sym || h.weightPct == null) continue;
    map.set(sym, h.weightPct);
    map.set(displaySymbol(sym), h.weightPct);
  }
  return map;
}

function annotate(
  run: RunForPortfolio,
  rows: RunCandidate[],
  holdings: Array<{ tokenId: string; symbol: string; actionId: string; weightBps: number; role?: HoldingRole; score?: number }>
) {
  return holdings.map((h) => {
    const c = rows.find((x) => x.resolvedTokenId === h.tokenId);
    return {
      ...h,
      role: h.role ?? asRole(c?.score?.role),
      rationale: c?.score?.whyInBasket || c?.score?.rationale || `Supports “${run.thesis?.normalizedTake}”.`,
      bullPoints: c?.score?.bullPoints,
      bearPoints: c?.score?.bearPoints
    };
  });
}

function equalWeight(rows: RunCandidate[]) {
  const cashBps = DEFAULT_CASH_BPS;
  const n = rows.length;
  const each = Math.floor((TOTAL_BPS - cashBps) / n);
  return {
    cashBps: TOTAL_BPS - each * n,
    holdings: rows.map((c) => ({
      tokenId: c.resolvedTokenId!,
      symbol: c.token!.symbol,
      actionId: asRole(c.score?.role),
      weightBps: each,
      role: asRole(c.score?.role),
      score: num(c.score?.exposure)
    }))
  };
}

export function withDraftPayload(run: RunForPortfolio, payload: unknown): RunForPortfolio {
  if (storedBasket(run.modelVersions)) return run;
  if (!storedBasket({ constructed: payload })) return run;
  const meta =
    run.modelVersions && typeof run.modelVersions === "object"
      ? { ...(run.modelVersions as Record<string, unknown>) }
      : {};
  return { ...run, modelVersions: { ...meta, constructed: payload } };
}

export function portfolioFromRun(run: RunForPortfolio) {
  const rows = run.candidates.filter((c) => c.holdable && c.resolvedTokenId && c.score && c.token);
  const stored = storedBasket(run.modelVersions);
  if (stored) {
    return {
      ok: true as const,
      cashBps: stored.cashBps,
      holdings: annotate(run, rows, stored.holdings),
      meta: run.modelVersions
    };
  }

  const weights = pmWeights(run.modelVersions);
  const constructed = constructPortfolio(
    rows.map((c) => {
      const role = asRole(c.score?.role);
      const key = c.token!.symbol.toUpperCase();
      return {
        tokenId: c.resolvedTokenId!,
        symbol: c.token!.symbol,
        actionId: role,
        exposure: num(c.score!.exposure),
        confidence: num(c.score!.confidence),
        halt: c.token!.isTradingHalt,
        role,
        proposedWeightPct: weights.get(key) ?? weights.get(displaySymbol(key))
      };
    })
  );
  if (constructed.ok) {
    return {
      ...constructed,
      holdings: annotate(run, rows, constructed.holdings),
      meta: run.modelVersions
    };
  }
  if (rows.length < MIN_HOLDINGS) return constructed;
  const fallback = equalWeight(rows);
  return {
    ok: true as const,
    cashBps: fallback.cashBps,
    holdings: annotate(run, rows, fallback.holdings),
    meta: run.modelVersions
  };
}
