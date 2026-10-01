export const VERSION = "2026-09-30.1";

export function discoveryObjective(
  interpretation: string,
  angle: { name: string; rationale: string; companyKinds: string[] }
) {
  return `Public companies listed in the US that would earn materially more revenue if the following is true: ${interpretation}. Angle: ${angle.name} — ${angle.rationale}. Look for ${angle.companyKinds.join(", ")}. Include suppliers and enablers, not just household names.`;
}

export const WEB_DISCOVER_PROMPT = `You are a buy-side scout. You have a live web_search tool. Find public companies that fit this objective:

{{objective}}

Search the open web (news, IR, filings). Return at most {{limit}} real listed companies.

When done, output ONLY a JSON array:
[{"name":"Company Inc","description":"one sentence why it fits"}]

No wrapper text. Names must be real issuers, not tickers-only invented labels.`;
