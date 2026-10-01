import { MIN_THESIS_ACTION_BPS, TOTAL_BPS } from "@takeandstake/shared";

export type ManagerAction = "keep" | "increase" | "decrease" | "add" | "remove";

export type ManagerProposal = {
  noChange?: boolean;
  cashBps?: number;
  holdings: Array<{
    tokenId: string;
    action: ManagerAction;
    conviction: number;
    reason: string;
    evidenceIds: string[];
    tiedToTakeAction: boolean;
    halted?: boolean;
  }>;
};

export type Mandate = {
  maxTurnoverDailyBps: number;
  maxTurnoverWeeklyBps: number;
  allowNewNames: boolean;
  maxNewNamesPerWeek: number;
  cashMinBps: number;
  cashMaxBps: number;
  skipTradeUsd: number;
};

export type GuardrailResult = {
  ok: boolean;
  violations: string[];
  trimmed: string[];
  cashBps: number;
  weights: Array<{ tokenId: string; weightBps: number }>;
};

export function applyGuardrails(
  proposal: ManagerProposal,
  current: Array<{ tokenId: string; weightBps: number }>,
  mandate: Mandate,
  opts: { pricesStale?: boolean; oraclePaused?: boolean; namesAddedThisWeek?: number; riskReductionOnly?: boolean }
): GuardrailResult {
  const violations: string[] = [];
  const trimmed: string[] = [];
  if (opts.pricesStale) violations.push("prices_stale");
  if (opts.oraclePaused) violations.push("oracle_paused");
  if (proposal.noChange) {
    return { ok: true, violations, trimmed, cashBps: current.find((c) => c.tokenId === "CASH")?.weightBps ?? 500, weights: current };
  }

  const next = new Map(current.map((c) => [c.tokenId, c.weightBps]));
  let cashBps = Math.min(mandate.cashMaxBps, Math.max(mandate.cashMinBps, proposal.cashBps ?? 500));
  let newNames = 0;

  for (const h of proposal.holdings) {
    if (h.halted && h.action !== "remove") {
      violations.push(`halted:${h.tokenId}`);
      continue;
    }
    if (h.action === "add") {
      if (!mandate.allowNewNames) {
        trimmed.push(`new_names_disabled:${h.tokenId}`);
        continue;
      }
      if ((opts.namesAddedThisWeek ?? 0) + newNames >= mandate.maxNewNamesPerWeek) {
        trimmed.push(`new_names_cap:${h.tokenId}`);
        continue;
      }
      if (opts.riskReductionOnly) {
        trimmed.push(`intraday_no_add:${h.tokenId}`);
        continue;
      }
      newNames += 1;
      next.set(h.tokenId, Math.round(h.conviction * 1500));
    }
    if (h.action === "remove") next.delete(h.tokenId);
    if (h.action === "increase") next.set(h.tokenId, Math.round((next.get(h.tokenId) ?? 0) * (1 + h.conviction * 0.2)));
    if (h.action === "decrease") next.set(h.tokenId, Math.round((next.get(h.tokenId) ?? 0) * (1 - h.conviction * 0.2)));
  }

  const thesisBps = proposal.holdings
    .filter((h) => h.tiedToTakeAction && next.has(h.tokenId))
    .reduce((s, h) => s + (next.get(h.tokenId) ?? 0), 0);
  const invested = [...next.values()].reduce((s, n) => s + n, 0);
  if (invested > 0 && thesisBps / invested < MIN_THESIS_ACTION_BPS / TOTAL_BPS) {
    violations.push("thesis_broken");
  }

  const currentMap = new Map(current.map((c) => [c.tokenId, c.weightBps]));
  let turnover = 0;
  for (const [id, w] of next) turnover += Math.abs(w - (currentMap.get(id) ?? 0));
  for (const [id, w] of currentMap) if (!next.has(id)) turnover += w;
  if (turnover > mandate.maxTurnoverDailyBps) {
    const scale = mandate.maxTurnoverDailyBps / turnover;
    for (const [id, w] of next) {
      const cur = currentMap.get(id) ?? 0;
      next.set(id, Math.round(cur + (w - cur) * scale));
    }
    trimmed.push("turnover_scaled");
  }

  const weights = [...next.entries()].map(([tokenId, weightBps]) => ({ tokenId, weightBps }));
  const sum = weights.reduce((s, w) => s + w.weightBps, 0) + cashBps;
  if (sum !== TOTAL_BPS && weights[0]) {
    weights[0].weightBps += TOTAL_BPS - sum;
  }

  return {
    ok: violations.length === 0,
    violations,
    trimmed,
    cashBps,
    weights
  };
}
