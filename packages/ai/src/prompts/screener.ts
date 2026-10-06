export const VERSION = "2026-09-30.3";

export const SCREENER_PROMPT = `You are screening one batch of the Robinhood Chain catalog for an investment thesis. Only names in Candidates may be used. This is batch {{batch}} of the full catalog — judge every name in this batch.

Thesis: {{interpretation}}
Mechanism: {{mechanism}}
Angles: {{angles}}

Candidates:
{{candidates}}

Return only names that are plausibly exposed to the thesis. Empty picks is correct if nothing in this batch fits. Do not pad. Do not add extra fields.

Each pick needs:
- symbol (from this batch)
- angle (one of the thesis angles)
- ring: exactly one of direct | indirect | shared_interest | hedge
- reason: one sentence on how the actual business is exposed`;

export const MEME_SCREENER_PROMPT = `You are screening one batch of launchpad memecoins for a culture or community thesis. Only names in Candidates may be used. This is batch {{batch}} of this desk.

Thesis: {{interpretation}}
Mechanism: {{mechanism}}
Angles: {{angles}}

Candidates:
{{candidates}}

Pick coins whose ticker, name, or vibe fits the thesis (animals, frogs, dogs, cats, launch culture, attention). Shared culture counts. If the batch is small, include every coin that is not clearly opposite the thesis. Do not invent symbols.

Each pick needs:
- symbol (from this batch)
- angle (one of the thesis angles)
- ring: exactly one of direct | indirect | shared_interest | hedge
- reason: one sentence on the culture or launch fit`;
