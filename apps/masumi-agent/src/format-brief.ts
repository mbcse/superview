type Holding = {
  symbol?: string;
  weightBps?: number;
  role?: string;
  score?: number;
};

type Portfolio = {
  cashBps?: number;
  holdings?: Holding[];
  thesis?: string;
};

type Spec = {
  normalizedTake?: string;
  mechanism?: string;
  horizon?: string;
  assumptions?: unknown;
  falsifiers?: unknown;
};

function asList(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x)).filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}

function pct(bps: number | undefined) {
  if (!Number.isFinite(bps)) return "?";
  return `${((Number(bps) / 10000) * 100).toFixed(1)}%`;
}

/** MIP-003 / Sokosumi expect a string result, not a raw JSON object. */
export function formatBrief(input: {
  belief: string;
  takeId?: string;
  runId?: string;
  portfolio?: unknown;
  spec?: unknown;
}): string {
  const portfolio = (input.portfolio ?? {}) as Portfolio;
  const spec = (input.spec ?? {}) as Spec;
  const holdings = Array.isArray(portfolio.holdings) ? portfolio.holdings : [];
  const lines: string[] = [];

  lines.push("# SuperView Research Brief");
  lines.push("");
  lines.push(`Belief: ${input.belief}`);
  if (spec.normalizedTake && spec.normalizedTake !== input.belief) {
    lines.push(`Normalized: ${spec.normalizedTake}`);
  }
  if (spec.mechanism) lines.push(`Mechanism: ${spec.mechanism}`);
  if (spec.horizon) lines.push(`Horizon: ${spec.horizon}`);

  const assumptions = asList(spec.assumptions);
  if (assumptions.length) {
    lines.push("");
    lines.push("Assumptions:");
    for (const a of assumptions) lines.push(`- ${a}`);
  }

  const falsifiers = asList(spec.falsifiers);
  if (falsifiers.length) {
    lines.push("");
    lines.push("Falsifiers:");
    for (const f of falsifiers) lines.push(`- ${f}`);
  }

  lines.push("");
  lines.push("Basket (Robinhood Chain stock tokens):");
  if (!holdings.length) {
    lines.push("- (no holdings in draft yet)");
  } else {
    for (const h of holdings) {
      const sym = h.symbol ?? "?";
      const role = h.role ? ` [${h.role}]` : "";
      lines.push(`- ${sym}${role}: ${pct(h.weightBps)}`);
    }
  }
  if (Number.isFinite(portfolio.cashBps)) {
    lines.push(`- CASH: ${pct(portfolio.cashBps)}`);
  }

  lines.push("");
  lines.push("Notes:");
  lines.push("- This brief was produced by SuperView's existing research pipeline (draft only).");
  lines.push("- Paper / live invest stays in the SuperView app; Cardano payment is for hiring this agent only.");
  lines.push("- Not investment advice.");
  if (input.runId) lines.push(`- SuperView runId: ${input.runId}`);
  if (input.takeId) lines.push(`- SuperView takeId: ${input.takeId}`);

  return lines.join("\n");
}
