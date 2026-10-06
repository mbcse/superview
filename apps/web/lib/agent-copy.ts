export function proposalLine(trades: unknown): string {
  if (trades == null) return "Checked today. No change.";
  if (typeof trades === "object" && !Array.isArray(trades) && "noChange" in (trades as object) && (trades as { noChange?: boolean }).noChange) {
    return "Checked today. No change.";
  }
  const rows = Array.isArray(trades)
    ? trades
    : typeof trades === "object" && trades && "holdings" in trades && Array.isArray((trades as { holdings: unknown }).holdings)
      ? (trades as { holdings: Array<Record<string, unknown>> }).holdings
      : [];
  const bits = rows
    .map((t) => {
      const action = String(t.action ?? t.side ?? "");
      const symbol = String(t.symbol ?? "");
      if (!symbol || action === "keep") return null;
      return `${action} ${symbol}`.trim();
    })
    .filter(Boolean);
  if (!bits.length) return "Checked today. No change.";
  return `Rebalance: ${bits.join(", ")}.`;
}

export function decisionLabel(status?: string) {
  if (status === "NO_CHANGE") return "Checked today. No change.";
  if (status === "PROPOSED") return "Proposal waiting.";
  if (status === "EXECUTED") return "Rebalanced.";
  return status?.replace(/_/g, " ") ?? "Checked today. No change.";
}
