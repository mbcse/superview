import { prisma } from "@takeandstake/db";
import { instructPocket } from "@takeandstake/ai";
import type { Env } from "@takeandstake/config";
import { depositPaperUsd, runDryRunInvest } from "./paper-invest.js";

export async function handlePocketChat(pocketId: string, userId: string, body: string, env: Env) {
  const userMsg = await prisma.pocketChat.create({
    data: { pocketId, userId, authorType: "USER", body }
  });
  const parsed = await instructPocket(pocketId, body);
  let reply = parsed.reply;
  const pocket = await prisma.pocket.findUnique({
    where: { id: pocketId },
    include: { mandate: true, take: { include: { revisions: { orderBy: { number: "desc" }, take: 1, include: { target: { include: { holdings: { include: { token: true } } } } } } } } }
  });
  if (!pocket) return { user: userMsg, agent: null };

  if (parsed.intent === "add_cash" && parsed.amountUsd) {
    await depositPaperUsd(pocketId, parsed.amountUsd);
    if (pocket.mandate?.mode !== "APPROVAL") {
      await runDryRunInvest(pocketId, env);
      reply = parsed.reply || `Added $${Math.round(parsed.amountUsd)} paper and put it into the basket.`;
    } else {
      reply = parsed.reply || `Added $${Math.round(parsed.amountUsd)} paper. Approve the next allocation if you want it in the basket.`;
    }
  } else if (parsed.intent === "mandate_ask_first") {
    await prisma.mandate.upsert({
      where: { pocketId },
      update: { mode: "APPROVAL" },
      create: { pocketId, mode: "APPROVAL" }
    });
    reply = parsed.reply || "I’ll ask before I change this pocket.";
  } else if (parsed.intent === "mandate_auto") {
    await prisma.mandate.upsert({
      where: { pocketId },
      update: { mode: "AUTO" },
      create: { pocketId, mode: "AUTO" }
    });
    reply = parsed.reply || "I’ll rebalance this pocket as the story changes.";
  } else if ((parsed.intent === "trim" || parsed.intent === "add_name") && parsed.symbol) {
    const symbol = parsed.symbol.replace(/^RH/, "").toUpperCase();
    const holdings = pocket.take.revisions[0]?.target?.holdings ?? [];
    const hit = holdings.find((h) => h.token.symbol.replace(/^RH/, "").toUpperCase() === symbol);
    await prisma.rebalanceProposal.create({
      data: {
        pocketId,
        trigger: "owner_chat",
        trades: {
          holdings: [
            {
              symbol: hit?.token.symbol ?? `RH${symbol}`,
              action: parsed.intent === "trim" ? "decrease" : "add",
              reason: body
            }
          ]
        },
        estCostUsd: 0,
        status: "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    reply =
      parsed.reply ||
      (pocket.mandate?.mode === "APPROVAL"
        ? `Proposed ${parsed.intent === "trim" ? "trim" : "add"} ${symbol}. Approve it below.`
        : `Queued ${parsed.intent === "trim" ? "trim" : "add"} ${symbol}.`);
  }

  const agentMsg = await prisma.pocketChat.create({
    data: { pocketId, authorType: "AGENT", body: reply }
  });
  return { user: userMsg, agent: agentMsg };
}
