import { prisma } from "@takeandstake/db";
import { cleanAbout } from "@takeandstake/core";
import { displaySymbol, logError } from "@takeandstake/shared";
import { DILIGENCE_PROMPT, fill } from "./prompts/index.js";
import { embedText } from "./embed.js";
import { hasOpenAI } from "./llm.js";
import { webSearchText } from "./web-research.js";

export type CompanyProfile = {
  description: string;
  segments: Array<{ name: string; share?: string }>;
  customers: string[];
  suppliers: string[];
  competitors: string[];
  financials: {
    revenueTtm?: string;
    growth?: string;
    operatingMargin?: string;
    fcf?: string;
    netDebt?: string;
    marketCap?: string;
    multiple?: string;
  };
  nextEarnings?: string;
  tags: string[];
  citations: string[];
};

export function asJson(value: unknown) {
  try {
    return JSON.parse(JSON.stringify(value ?? null)) as object | null;
  } catch {
    return null;
  }
}

export function parseNextEarnings(value: unknown): Date | undefined {
  if (value == null || value === "") return undefined;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
  if (typeof value === "number" && Number.isFinite(value)) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof value !== "string") return undefined;
  const direct = new Date(value);
  if (!Number.isNaN(direct.getTime())) return direct;
  const iso = value.match(/(\d{4}-\d{2}-\d{2})/);
  const day = iso?.[1];
  if (day) {
    const d = new Date(day);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return undefined;
}

function asText(value: unknown, fallback = "") {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") return JSON.stringify(value);
  return fallback;
}

export async function enrichToken(tokenId: string) {
  const company = await prisma.universeCompany.findUnique({
    where: { tokenId },
    include: { token: true }
  });
  if (!company) return null;
  const prompt = fill(DILIGENCE_PROMPT, {
    company: company.legalName,
    symbol: company.token.symbol,
    interpretation: "general public-company profile for an investing research agent"
  });
  const raw = await webSearchText(
    `${prompt}\nUse web_search. Return compact JSON with description, segments, customers, suppliers, competitors, financials, nextEarnings, tags, citations.`,
    8
  );
  let profile: CompanyProfile = {
    description: raw.slice(0, 1200),
    segments: [],
    customers: [],
    suppliers: [],
    competitors: [],
    financials: {},
    tags: [],
    citations: []
  };
  try {
    const jsonStart = raw.indexOf("{");
    const jsonEnd = raw.lastIndexOf("}");
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as Partial<CompanyProfile>;
      profile = {
        ...profile,
        ...parsed,
        financials: parsed.financials ?? {},
        tags: parsed.tags ?? [],
        citations: parsed.citations ?? []
      };
    }
  } catch {
    /* keep raw description */
  }
  const summary = asText(profile.description, company.businessSummary);
  const embedding = await embedText(
    `${company.legalName} ${company.token.symbol} ${summary} ${(Array.isArray(profile.tags) ? profile.tags : []).join(" ")}`
  );
  await prisma.universeCompany.update({
    where: { id: company.id },
    data: {
      businessSummary: summary.slice(0, 4000),
      segments: asJson(profile.segments ?? []) ?? [],
      tags: asJson(Array.isArray(profile.tags) ? profile.tags : []) ?? [],
      profile: asJson(profile) ?? {},
      embedding: embedding.length ? embedding : undefined,
      nextEarningsAt: parseNextEarnings(profile.nextEarnings),
      refreshedAt: new Date()
    }
  });
  return profile;
}

export async function fillCompanyAbout(tokenId: string) {
  const company = await prisma.universeCompany.findUnique({
    where: { tokenId },
    include: { token: true }
  });
  if (!company) return null;
  const cached = cleanAbout(company.businessSummary) ?? cleanAbout(company.profile);
  if (cached) return cached;
  if (!hasOpenAI()) return null;
  const symbol = displaySymbol(company.token.symbol, company.token.source);
  const raw = await webSearchText(
    `What does ${company.legalName} (ticker ${symbol}) do as a public company? Write 2-3 plain sentences about the business. No JSON, no bullets, no citations.`,
    3
  );
  const about = cleanAbout(raw);
  if (!about) return null;
  const prev = company.profile && typeof company.profile === "object" ? { ...(company.profile as object) } : {};
  await prisma.universeCompany.update({
    where: { id: company.id },
    data: {
      businessSummary: about.slice(0, 4000),
      profile: asJson({ ...prev, description: about }) ?? prev,
      refreshedAt: new Date()
    }
  });
  return about;
}

export async function enrichStale(limit = 8) {
  if (!hasOpenAI()) return { enriched: 0, skipped: "no_openai" as const };
  const researchBusy = await prisma.researchRun.count({
    where: {
      status: {
        in: ["PENDING", "INTERPRETING", "SCREENING", "DISCOVERING", "ENRICHING", "DILIGENCE", "SCORING", "ANALYST", "PORTFOLIO", "CRITIC"]
      }
    }
  });
  if (researchBusy) return { enriched: 0, skipped: "research_running" as const };

  const stale = await prisma.universeCompany.findMany({
    where: {
      OR: [{ businessSummary: "" }, { refreshedAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }]
    },
    take: limit,
    orderBy: { refreshedAt: "asc" }
  });
  const out = [];
  for (const c of stale) {
    try {
      out.push(await enrichToken(c.tokenId));
    } catch (e) {
      logError("ai", "enrich fail", e, { name: c.legalName });
    }
  }
  return { enriched: out.filter(Boolean).length };
}
