export type RegimeInput = {
  spxVs50d: number;
  vix: number;
  vixChange: number;
  breadth: number;
};

export function classifyRegime(input: RegimeInput): "RISK_ON" | "NEUTRAL" | "RISK_OFF" {
  if (input.vix > 25 || input.spxVs50d < -0.04 || input.breadth < 0.35) return "RISK_OFF";
  if (input.vix < 16 && input.spxVs50d > 0.02 && input.breadth > 0.55) return "RISK_ON";
  return "NEUTRAL";
}

export function oracleBand(world?: string | null, source?: string | null, inSession = true) {
  if (world === "MEMES") return 0.04;
  if (source === "XSTOCKS") return inSession ? 0.015 : 0.04;
  return 0.015;
}

export function quoteWithinOracle(quotePrice: number, oraclePrice: number, tol = 0.02): boolean {
  if (oraclePrice <= 0) return false;
  return Math.abs(quotePrice - oraclePrice) / oraclePrice <= tol;
}

export function isRestrictedCountry(code?: string | null): boolean {
  if (!code) return true;
  return ["US", "GB", "CA", "CH", "AE"].includes(code.toUpperCase());
}

export function canSponsorCall(to: string, allowed: Set<string>): boolean {
  return allowed.has(to.toLowerCase());
}
