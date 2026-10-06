import { prisma } from "@takeandstake/db";
import { displaySymbol } from "@takeandstake/shared";
import { genObject } from "./generate.js";
import { socialModel } from "./llm.js";
import { pocketInstructSchema } from "./prompts/schemas.js";

export async function instructPocket(pocketId: string, message: string) {
  const pocket = await prisma.pocket.findUnique({
    where: { id: pocketId },
    include: {
      mandate: true,
      take: {
        include: {
          revisions: {
            orderBy: { number: "desc" },
            take: 1,
            include: { target: { include: { holdings: { include: { token: true } } } } }
          }
        }
      }
    }
  });
  if (!pocket) throw new Error("pocket_not_found");
  const names = (pocket.take.revisions[0]?.target?.holdings ?? []).map((h) => displaySymbol(h.token.symbol, h.token.source)).join(", ");
  const mandate = pocket.mandate?.mode === "APPROVAL" ? "Ask me first" : "Autopilot";
  try {
    return await genObject({
      model: socialModel(),
      schema: pocketInstructSchema,
      label: "pocket-instruct",
      prompt: `You are the SuperView agent for this paper pocket. Mandate: ${mandate}. Basket: ${names || "empty"}.
The owner said: ${JSON.stringify(message)}

Pick one intent:
- add_cash: they want to add paper dollars (set amountUsd)
- mandate_ask_first: they want you to ask before trading
- mandate_auto: they want you to rebalance without asking
- trim: reduce or exit a name (set symbol)
- add_name: add a ticker already in the universe (set symbol)
- talk: anything else; reply in one or two short sentences. Do not claim you changed money unless you picked add_cash.

Reply as the agent, no markdown.`
    });
  } catch {
    return {
      intent: "talk" as const,
      reply: "I heard you. Try “add $500”, “trim NVDA”, or “ask me first”."
    };
  }
}
