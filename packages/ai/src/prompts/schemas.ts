import { z } from "zod";

const RINGS = ["direct", "indirect", "shared_interest", "hedge"] as const;
export const ringSchema = z.enum(RINGS);
export const ringFromLlm = z.string().transform((v): (typeof RINGS)[number] =>
  (RINGS as readonly string[]).includes(v) ? (v as (typeof RINGS)[number]) : "indirect"
);

export const interpreterSchema = z.object({
  normalizedView: z.string(),
  interpretation: z.string(),
  mechanism: z.string(),
  horizon: z.string(),
  confidenceInInterpretation: z.number().min(0).max(1),
  assumptions: z.array(z.string()),
  falsifiers: z.array(z.string()),
  clarifyingQuestions: z.array(z.string()).max(6).default([]),
  angles: z.array(
    z.object({
      name: z.string(),
      ring: ringFromLlm,
      rationale: z.string(),
      companyKinds: z.array(z.string()),
      searchPhrases: z.array(z.string())
    })
  ).default([]),
  refuse: z.boolean().default(false),
  refuseReason: z.string().optional()
});

export const screenerSchema = z.object({
  picks: z.array(
    z.object({
      symbol: z.string(),
      name: z.string().optional(),
      relevant: z.boolean().optional().default(true),
      angle: z.string().default(""),
      ring: ringFromLlm,
      reason: z.string()
    })
  ),
  missingAngles: z.array(z.string()).default([])
});

export const analystItemSchema = z.object({
  symbol: z.string(),
  exposurePurity: z.number().min(0).max(1),
  directness: z.number().min(0).max(1),
  quality: z.number().min(0).max(1),
  valuationRoom: z.number().min(0).max(1),
  riskPenalty: z.number().min(0).max(1),
  confidence: z.number().min(0).max(1),
  role: ringFromLlm,
  whyInBasket: z.string(),
  bullPoints: z.array(z.string()).max(6).default([]),
  bearPoints: z.array(z.string()).max(6).default([]),
  whatWouldMakeUsSell: z.string(),
  sourceIds: z.array(z.string()).default([])
});

export const analystBatchSchema = z.object({
  items: z.array(analystItemSchema)
});

export const portfolioManagerSchema = z.object({
  holdings: z.array(
    z.object({
      symbol: z.string(),
      weightPct: z.number().min(1).max(40),
      role: ringFromLlm,
      conviction: z.number().min(0).max(1),
      sizingReason: z.string()
    })
  ),
  cashPct: z.number().min(0).max(25),
  basketThesis: z.string(),
  keyRisks: z.array(z.string()).max(8).default([]),
  rebalancePolicy: z.string(),
  expectedBehavior: z.string()
});

export const criticSchema = z.object({
  verdict: z.enum(["approve", "revise"]),
  issues: z.array(
    z.object({
      symbol: z.string().optional(),
      problem: z.string(),
      suggestedFix: z.string().default("")
    })
  ).default([])
});

export const monitorSchema = z.object({
  decision: z.enum(["no_change", "rebalance", "add", "trim", "exit"]),
  trades: z.array(
    z.object({
      symbol: z.string(),
      action: z.enum(["add", "trim", "exit", "increase", "decrease", "keep"]),
      fromPct: z.number(),
      toPct: z.number(),
      reason: z.string(),
      sourceIds: z.array(z.string()).default([])
    })
  ),
  thesisHealth: z.number().min(0).max(100),
  thesisHealthDelta: z.number(),
  thesisHealthReason: z.string(),
  post: z.string()
});

export const threadReplySchema = z.object({
  body: z.string().max(600)
});

export const pocketInstructSchema = z.object({
  intent: z.enum(["add_cash", "mandate_ask_first", "mandate_auto", "trim", "add_name", "talk"]),
  reply: z.string().max(600),
  amountUsd: z.number().positive().optional(),
  symbol: z.string().optional()
});

export type InterpreterOut = z.infer<typeof interpreterSchema>;
export type ScreenerOut = z.infer<typeof screenerSchema>;
export type AnalystItem = z.infer<typeof analystItemSchema>;
export type PortfolioManagerOut = z.infer<typeof portfolioManagerSchema>;
export type CriticOut = z.infer<typeof criticSchema>;
export type MonitorOut = z.infer<typeof monitorSchema>;
export type PocketInstructOut = z.infer<typeof pocketInstructSchema>;
