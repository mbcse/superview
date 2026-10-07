import { z } from "zod";

const takeSentenceObject = z.object({
  sentence: z.string().max(280).optional().default(""),
  horizon: z.string().optional(),
  falsifier: z.string().optional(),
  world: z.enum(["STOCKS", "MEMES"]).optional().default("STOCKS"),
  chainId: z.coerce.number().int().optional(),
  parentTakeId: z.string().optional(),
  lens: z.enum(["BELIEF", "SKY"]).optional().default("BELIEF"),
  astrologySystem: z.enum(["VEDIC", "WESTERN"]).optional(),
  chart: z.string().max(4000).optional()
});

function refineTakeSentence(
  v: z.infer<typeof takeSentenceObject>,
  ctx: z.RefinementCtx
) {
  const sentence = (v.sentence ?? "").trim();
  const chart = (v.chart ?? "").trim();
  if (v.lens === "SKY") {
    if (chart.length < 8) ctx.addIssue({ code: "custom", path: ["chart"], message: "chart_required" });
  } else if (!sentence) {
    ctx.addIssue({ code: "custom", path: ["sentence"], message: "sentence_required" });
  }
}

export const takeSentenceSchema = takeSentenceObject.superRefine(refineTakeSentence);

export const investSchema = z.object({
  mode: z.enum(["paper", "live", "WATCH", "DRY_RUN", "LIVE"]).optional(),
  amountUsd: z.number().positive(),
  idempotencyKey: z.string().min(8).max(80).optional()
});

export const decomposeRequestSchema = takeSentenceObject.extend({
  answers: z.array(z.string()).max(3).optional()
}).superRefine(refineTakeSentence);

export const actionEditSchema = z.object({
  id: z.string(),
  name: z.string().min(2),
  description: z.string(),
  userIncluded: z.boolean()
});

export const backRequestSchema = z.object({
  level: z.enum(["WATCH", "DRY_RUN", "LIVE"]),
  amountUsd: z.number().positive().optional(),
  revealAmount: z.boolean().optional().default(false),
  mandateMode: z.enum(["AUTO", "APPROVAL"]).default("AUTO"),
  cashMinBps: z.number().int().min(0).max(3000).optional(),
  cashMaxBps: z.number().int().min(0).max(3000).optional(),
  maxTurnoverDailyBps: z.number().int().min(0).max(5000).optional(),
  maxTurnoverWeeklyBps: z.number().int().min(0).max(5000).optional(),
  allowNewNames: z.boolean().optional()
});

export const backingPrivacySchema = z.object({
  revealAmount: z.boolean()
});

export const pocketChatSchema = z.object({
  body: z.string().min(1).max(4000)
});

export const commentSchema = z.object({
  kind: z.enum([
    "QUESTION",
    "EVIDENCE",
    "RISK",
    "CORRECTION",
    "UPDATE",
    "AGENT_BRIEF",
    "AGENT_TRADE"
  ]),
  body: z.string().min(1).max(4000),
  parentId: z.string().optional(),
  sourceUrl: z.string().url().optional(),
  claimId: z.string().optional()
});

export const stanceSchema = z.object({
  stance: z.enum(["BULL", "BEAR", "UNSURE"])
});

export const publishTakeSchema = z.object({
  takeId: z.string(),
  researchRunId: z.string(),
  removedTokenIds: z.array(z.string()).optional()
});

export const withdrawSchema = z.object({
  toAddress: z.string().regex(/^0x[a-fA-F0-9]{40}$/),
  amount: z.string()
});

export type TakeSentenceInput = z.infer<typeof takeSentenceSchema>;
export type BackRequest = z.infer<typeof backRequestSchema>;
export type CommentInput = z.infer<typeof commentSchema>;
