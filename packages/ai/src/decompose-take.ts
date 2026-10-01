import { generateObject } from "ai";
import { thesisSpecSchema, type ThesisSpec } from "./thesis-schema.js";
import { resolveLanguageModel } from "./llm.js";

export async function decomposeTake(sentence: string): Promise<ThesisSpec> {
  const trimmed = sentence.trim();
  const { object } = await generateObject({
    model: resolveLanguageModel() as unknown as Parameters<typeof generateObject>[0]["model"],
    schema: thesisSpecSchema,
    prompt: `You are an investing research agent. The user wrote a one-sentence economic take (not a meme or ticker pump).

Take: "${trimmed}"

Decompose it into a tradable thesis:
- normalizedTake: clean one sentence
- interpretation: 2-3 sentences on the economic mechanism
- horizon: e.g. 3y, 5y, 10y
- assumptions, falsifiers (arrays of short strings)
- questions: up to 3 clarifying questions (empty if clear)
- refuse: true only if this is not a real economic view (meme, single ticker call, too vague)
- refuseReason: if refuse
- actions: 2-4 distinct investment angles (name + description + companyKinds). Each action should be a different way the take could show up in public equities.`
  });
  return thesisSpecSchema.parse(object);
}
