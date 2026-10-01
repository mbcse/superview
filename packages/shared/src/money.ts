import { TOTAL_BPS } from "./constants.js";

export function bpsToRatio(bps: number): number {
  return bps / TOTAL_BPS;
}

export function ratioToBps(ratio: number): number {
  return Math.round(ratio * TOTAL_BPS);
}

export function assertBpsSum(weights: number[], cashBps: number): void {
  const sum = weights.reduce((a, b) => a + b, 0) + cashBps;
  if (sum !== TOTAL_BPS) {
    throw new Error(`Weights must sum to ${TOTAL_BPS}, got ${sum}`);
  }
}

export function formatUsd(value: string | number): string {
  const n = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export function formatPct(bpsOrRatio: number, asBps = false): string {
  const pct = asBps ? bpsOrRatio / 100 : bpsOrRatio * 100;
  const sign = pct > 0 ? "+" : pct < 0 ? "−" : "";
  return `${sign}${Math.abs(pct).toFixed(2)}%`;
}

export function roundMoney(value: number, decimals = 2): number {
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}
