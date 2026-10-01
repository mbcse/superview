import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { ResearchConfigError } from "./errors.js";

function openai() {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return null;
  return createOpenAI({ apiKey: key });
}

function anthropic() {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key || key.startsWith("sk-proj-")) return null;
  return createAnthropic({ apiKey: key });
}

export function resolveLanguageModel() {
  return researchModel();
}

const HAIKU = "claude-haiku-4-5";

export function researchModel() {
  const o = openai();
  if (o) return o(process.env.RESEARCH_MODEL?.trim() || "gpt-4o");
  const a = anthropic();
  if (a) return a(process.env.RESEARCH_MODEL?.trim() || HAIKU);
  throw new ResearchConfigError("Set OPENAI_API_KEY or ANTHROPIC_API_KEY for research.");
}

export function researchResponsesModel() {
  const o = openai();
  if (!o) throw new ResearchConfigError("OPENAI_API_KEY required for web research.");
  return o.responses(process.env.RESEARCH_MODEL?.trim() || "gpt-4o");
}

export function webSearchTool() {
  const o = openai();
  if (!o) throw new ResearchConfigError("OPENAI_API_KEY required for web research.");
  return o.tools.webSearch({
    searchContextSize: "high",
    externalWebAccess: true,
    userLocation: { type: "approximate", country: "US" }
  });
}

export function fastModel() {
  const o = openai();
  if (o) return o(process.env.FAST_MODEL?.trim() || "gpt-4o-mini");
  return researchModel();
}

export function criticModel() {
  const a = anthropic();
  if (a) return a(process.env.CRITIC_MODEL?.trim() || HAIKU);
  return researchModel();
}

export function socialModel() {
  const a = anthropic();
  if (a) return a(process.env.SOCIAL_MODEL?.trim() || HAIKU);
  return fastModel();
}

export function modelIdOf(model: unknown) {
  if (model && typeof model === "object" && "modelId" in model) {
    return String((model as { modelId: string }).modelId);
  }
  return "unknown";
}

export function describeLlm() {
  return {
    openai: Boolean(openai()),
    anthropic: Boolean(anthropic()),
    research: process.env.RESEARCH_MODEL?.trim() || (openai() ? "gpt-4o" : HAIKU),
    fast: process.env.FAST_MODEL?.trim() || (openai() ? "gpt-4o-mini" : HAIKU),
    critic: process.env.CRITIC_MODEL?.trim() || (anthropic() ? HAIKU : process.env.RESEARCH_MODEL?.trim() || HAIKU)
  };
}

export function hasOpenAI() {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

export function embeddingModel() {
  const o = openai();
  if (!o) throw new ResearchConfigError("OPENAI_API_KEY required for embeddings.");
  return o.embedding("text-embedding-3-large");
}
