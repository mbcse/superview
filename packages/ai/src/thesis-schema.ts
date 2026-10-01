import { z } from "zod";

export const thesisSpecSchema = z.object({
  normalizedTake: z.string(),
  interpretation: z.string(),
  horizon: z.string(),
  assumptions: z.array(z.string()),
  falsifiers: z.array(z.string()),
  questions: z.array(z.string()).max(6),
  refuse: z.boolean().default(false),
  refuseReason: z.string().optional(),
  actions: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      companyKinds: z.array(z.string())
    })
  )
});

export type ThesisSpec = z.infer<typeof thesisSpecSchema>;
