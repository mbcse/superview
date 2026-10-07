const ALLOWED_PROGRAMS = new Set([
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
  "6EF8rrecthR5Dkzon8Nwu78hRvfCCubJ2FS9g56WvevH",
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA",
  "dbcij3LWUppWqq96dh6gJWwBifmcGfLSB5D4DuSMaqN",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb",
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
  "ComputeBudget111111111111111111111111111111",
  "11111111111111111111111111111111",
  "AddressLookupTab1e1111111111111111111111111"
]);

export type Ix = { programId: string; accounts?: string[]; data?: string };

/** Reject System or token transfers whose destination is not one of the user's accounts. */
const ROUTE_OK = /jupiter|pump|meteora|raydium|orca|lifinity|phoenix|whirlpool|bags/i;

export function inspectJupiterRoute(raw: unknown): { ok: boolean; reason?: string } {
  const plan = (raw as { routePlan?: Array<{ swapInfo?: { label?: string; ammKey?: string } }> })?.routePlan;
  if (!Array.isArray(plan) || !plan.length) return { ok: false, reason: "no_route" };
  for (const hop of plan) {
    const label = hop.swapInfo?.label ?? "";
    if (label && !ROUTE_OK.test(label)) return { ok: false, reason: `route_not_allowed:${label}` };
  }
  return { ok: true };
}

export function inspectSolanaIxs(ixs: Ix[], ownerAccounts: string[]): { ok: boolean; reason?: string } {
  const mine = new Set(ownerAccounts);
  for (const ix of ixs) {
    if (!ALLOWED_PROGRAMS.has(ix.programId)) {
      return { ok: false, reason: `program_not_allowed:${ix.programId}` };
    }
    if (ix.programId === "11111111111111111111111111111111") {
      const dest = ix.accounts?.[1];
      if (dest && !mine.has(dest)) return { ok: false, reason: "foreign_system_transfer" };
    }
    if (
      ix.programId === "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" ||
      ix.programId === "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
    ) {
      const dest = ix.accounts?.[1] ?? ix.accounts?.[2];
      if (dest && !mine.has(dest)) return { ok: false, reason: "foreign_token_transfer" };
    }
  }
  return { ok: true };
}
