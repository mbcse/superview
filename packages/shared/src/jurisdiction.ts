import type { AssetSource } from "./worlds.js";

/** Restricted ISO countries per launch origin. Paper stays open everywhere. */
export const SOURCE_RESTRICTED: Record<AssetSource | "MEMES", string[]> = {
  ROBINHOOD: ["US", "GB", "CA", "CH", "AE"],
  XSTOCKS: ["US", "GB", "CA", "CH", "AE"],
  BAGS: ["US"],
  PUMPFUN: ["US"],
  OTHER: ["US"],
  MEMES: ["US"]
};

export function sourceRestricted(source: AssetSource | "MEMES", country?: string | null) {
  if (!country) return false;
  return (SOURCE_RESTRICTED[source] ?? []).includes(country.toUpperCase());
}
