import {
  ACTION_CAP_BPS,
  DEFAULT_CASH_BPS,
  DIRECT_MIN_BPS,
  HEDGE_MAX_BPS,
  INDIRECT_MAX_BPS,
  ISSUER_CAP_BPS,
  MAX_HOLDINGS,
  MEME_MAX_HOLDINGS,
  MEME_MAX_WEIGHT,
  MEME_MIN_HOLDINGS,
  MIN_HOLDING_BPS,
  MIN_HOLDINGS,
  SECTOR_CAP_BPS,
  SHARED_MAX_BPS,
  SINGLE_TICKER_ANCHOR_BPS,
  TOTAL_BPS
} from "@takeandstake/shared";

export type HoldingRole = "direct" | "indirect" | "shared_interest" | "hedge";

export type Candidate = {
  tokenId: string;
  symbol: string;
  actionId: string;
  sector?: string;
  issuerId?: string;
  exposure: number;
  confidence: number;
  halt?: boolean;
  role?: HoldingRole;
  purity?: number;
  quality?: number;
  riskPenalty?: number;
  proposedWeightPct?: number;
};

export type ConstructionResult =
  | {
      ok: true;
      cashBps: number;
      holdings: Array<{
        tokenId: string;
        symbol: string;
        actionId: string;
        weightBps: number;
        score: number;
        role: HoldingRole;
      }>;
      diffs: Array<{ symbol: string; proposedBps: number; finalBps: number }>;
    }
  | { ok: false; code: "INSUFFICIENT_ELIGIBLE_EXPOSURE"; coverage: Record<string, boolean> };

export function constructPortfolio(
  candidates: Candidate[],
  cashBps = DEFAULT_CASH_BPS,
  opts: { singleTickerAnchor?: boolean; world?: "STOCKS" | "MEMES" } = {}
): ConstructionResult {
  const meme = opts.world === "MEMES";
  const minHold = meme ? MEME_MIN_HOLDINGS : MIN_HOLDINGS;
  const maxHold = meme ? MEME_MAX_HOLDINGS : MAX_HOLDINGS;
  const issuerCap = meme ? Math.round(MEME_MAX_WEIGHT * TOTAL_BPS) : ISSUER_CAP_BPS;
  const cash = Math.min(Math.max(cashBps, 0), meme ? 500 : 1_000);
  const eligible = candidates.filter((c) => !c.halt && c.exposure > 0 && c.confidence > 0);
  const scored = eligible.map((c) => {
    const purity = c.purity ?? c.exposure;
    const quality = c.quality ?? 0.6;
    const risk = Math.max(0.15, 1 - (c.riskPenalty ?? 0.2));
    const pm = c.proposedWeightPct != null ? c.proposedWeightPct / 100 : 0;
    const raw = c.exposure * c.confidence * purity * quality * risk + pm * 0.35;
    return { ...c, role: (c.role ?? "direct") as HoldingRole, score: raw };
  });
  scored.sort((a, b) => b.score - a.score);
  const picked = scored.slice(0, maxHold);
  if (picked.length < minHold) {
    if (meme && picked.length >= 1) return themeEqualWeight(picked, cash, maxHold, issuerCap);
    const coverage: Record<string, boolean> = {};
    for (const c of candidates) coverage[c.actionId] = false;
    return { ok: false, code: "INSUFFICIENT_ELIGIBLE_EXPOSURE", coverage };
  }

  const investable = TOTAL_BPS - cash;
  const totalScore = picked.reduce((s, c) => s + c.score, 0) || 1;
  let weights = picked.map((c) => ({
    ...c,
    weightBps: Math.floor((c.score / totalScore) * investable)
  }));

  const maxIssuer = meme ? issuerCap : opts.singleTickerAnchor ? SINGLE_TICKER_ANCHOR_BPS : ISSUER_CAP_BPS;
  for (let i = 0; i < 16; i++) {
    weights = clampAndRedistribute(weights, investable, maxIssuer);
  }

  const minBps = meme ? 500 : MIN_HOLDING_BPS;
  weights = weights.filter((w) => w.weightBps >= minBps);
  if (weights.length < minHold) {
    return themeEqualWeight(picked, cash, maxHold, meme ? issuerCap : undefined);
  }

  const directSum = weights.filter((w) => w.role === "direct").reduce((s, w) => s + w.weightBps, 0);
  if (directSum > 0 && directSum < DIRECT_MIN_BPS) {
    const need = DIRECT_MIN_BPS - directSum;
    const others = weights.filter((w) => w.role !== "direct");
    const otherSum = others.reduce((s, w) => s + w.weightBps, 0);
    if (otherSum > need) {
      for (const o of others) {
        const cut = Math.floor((o.weightBps / otherSum) * need);
        o.weightBps -= cut;
      }
      const directs = weights.filter((w) => w.role === "direct");
      const dSum = directs.reduce((s, w) => s + w.weightBps, 0) || 1;
      for (const d of directs) d.weightBps += Math.floor((d.weightBps / dSum) * need);
    }
  }

  for (let i = 0; i < 8; i++) {
    weights = clampAndRedistribute(weights, investable, maxIssuer);
  }
  weights = weights.filter((w) => w.weightBps >= minBps);
  if (weights.length < minHold) {
    return themeEqualWeight(picked, cash, maxHold, meme ? issuerCap : undefined);
  }

  const holdingSum = weights.reduce((s, w) => s + w.weightBps, 0);
  const finalCash = Math.min(1_000, Math.max(0, TOTAL_BPS - holdingSum));

  const diffs = weights.map((w) => ({
    symbol: w.symbol,
    proposedBps: w.proposedWeightPct != null ? Math.round(w.proposedWeightPct * 100) : w.weightBps,
    finalBps: w.weightBps
  }));

  return {
    ok: true,
    cashBps: finalCash,
    diffs,
    holdings: weights.map((w) => ({
      tokenId: w.tokenId,
      symbol: w.symbol,
      actionId: w.actionId,
      weightBps: w.weightBps,
      score: w.score,
      role: w.role
    }))
  };
}

function themeEqualWeight(
  picked: Array<Candidate & { role: HoldingRole; score: number }>,
  cash: number,
  maxHold = MAX_HOLDINGS,
  nameCap?: number
): ConstructionResult {
  const take = picked.slice(0, Math.min(maxHold, picked.length));
  const investable = TOTAL_BPS - cash;
  const cap = nameCap ?? investable;
  const each = Math.min(cap, Math.floor(investable / take.length));
  const holdings = take.map((c) => ({
    tokenId: c.tokenId,
    symbol: c.symbol,
    actionId: c.actionId,
    weightBps: each,
    score: c.score,
    role: c.role
  }));
  const holdingSum = each * take.length;
  return {
    ok: true,
    cashBps: Math.max(0, TOTAL_BPS - holdingSum),
    diffs: holdings.map((h) => ({
      symbol: h.symbol,
      proposedBps: h.weightBps,
      finalBps: h.weightBps
    })),
    holdings
  };
}

function clampAndRedistribute<
  T extends {
    weightBps: number;
    issuerId?: string;
    tokenId?: string;
    actionId: string;
    sector?: string;
    role?: HoldingRole;
  }
>(rows: T[], investable: number, issuerCap: number): T[] {
  const issuerUsed = new Map<string, number>();
  const actionUsed = new Map<string, number>();
  const sectorUsed = new Map<string, number>();
  const roleUsed = new Map<string, number>();

  for (const r of rows) {
    const issuer = r.issuerId ?? r.tokenId ?? "unknown";
    r.weightBps = clampInto(issuerUsed, issuer, r.weightBps, issuerCap);
    r.weightBps = clampInto(actionUsed, r.actionId, r.weightBps, ACTION_CAP_BPS);
    if (r.sector) r.weightBps = clampInto(sectorUsed, r.sector, r.weightBps, SECTOR_CAP_BPS);
    const roleCap =
      r.role === "hedge" ? HEDGE_MAX_BPS : r.role === "shared_interest" ? SHARED_MAX_BPS : r.role === "indirect" ? INDIRECT_MAX_BPS : 10_000;
    if (r.role) r.weightBps = clampInto(roleUsed, r.role, r.weightBps, roleCap);
  }

  const used = rows.reduce((s, r) => s + r.weightBps, 0);
  const leftover = investable - used;
  if (leftover <= 0) return rows;
  const room = rows.map((r) => {
    const issuer = r.issuerId ?? r.tokenId ?? "unknown";
    const issuerRoom = issuerCap - (issuerUsed.get(issuer) ?? 0);
    const actionRoom = ACTION_CAP_BPS - (actionUsed.get(r.actionId) ?? 0);
    const sectorRoom = r.sector ? SECTOR_CAP_BPS - (sectorUsed.get(r.sector) ?? 0) : ISSUER_CAP_BPS;
    return Math.max(0, Math.min(issuerRoom, actionRoom, sectorRoom));
  });
  const roomSum = room.reduce((s, n) => s + n, 0);
  if (roomSum === 0) return rows;
  rows.forEach((r, i) => {
    r.weightBps += Math.floor((leftover * (room[i] ?? 0)) / roomSum);
  });
  return rows;
}

function clampInto(map: Map<string, number>, key: string, amount: number, cap: number) {
  const next = Math.min((map.get(key) ?? 0) + amount, cap);
  const overflow = (map.get(key) ?? 0) + amount - next;
  map.set(key, next);
  return amount - overflow;
}

export function exposureScore(input: {
  directness: number;
  purityLow: number;
  purityHigh: number;
  sensitivity: number;
}): number {
  const purityMid = (input.purityLow + input.purityHigh) / 2;
  return input.directness * (0.65 * purityMid + 0.35 * input.sensitivity);
}
