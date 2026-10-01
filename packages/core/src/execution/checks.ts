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
