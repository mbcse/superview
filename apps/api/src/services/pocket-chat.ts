import { prisma } from "@takeandstake/db";
import { displaySymbol } from "@takeandstake/shared";
import { instructPocket } from "@takeandstake/ai";
import type { Env } from "@takeandstake/config";
import { depositPaperUsd, executePaperRebalance, runDryRunInvest, weightsFromTrimAdd } from "./paper-invest.js";

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
    const deposited = await depositPaperUsd(pocketId, parsed.amountUsd);
    if ("error" in deposited) {
      reply = `Couldn’t add paper cash (${deposited.error}).`;
    } else if (pocket.mandate?.mode !== "APPROVAL") {
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
    const symbol = displaySymbol(parsed.symbol).toUpperCase();
    const target = pocket.take.revisions[0]?.target;
    const holdings = target?.holdings ?? [];
    let addTokenId: string | undefined;
    if (parsed.intent === "add_name") {
      const token = await prisma.stockToken.findFirst({
        where: { chainId: 4663, symbol: { in: [symbol, `RH${symbol}`] }, status: "ACTIVE" }
      });
      addTokenId = token?.id;
    }
    const next = weightsFromTrimAdd(holdings, target?.cashBps ?? 500, parsed.intent, symbol, addTokenId);
    const proposal = await prisma.rebalanceProposal.create({
      data: {
        pocketId,
        trigger: "owner_chat",
        trades: { weights: next.weights, cashBps: next.cashBps, intent: parsed.intent, symbol },
        estCostUsd: 0,
        status: pocket.mandate?.mode === "APPROVAL" ? "PENDING" : "PENDING",
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    });
    if (pocket.mandate?.mode !== "APPROVAL" && pocket.mode === "DRY_RUN") {
      const exec = await executePaperRebalance(pocketId, env, next.weights, {
        proposalId: proposal.id,
        cashBps: next.cashBps,
        changeSummary: `${parsed.intent === "trim" ? "Trim" : "Add"} ${symbol}`
      });
      reply =
        parsed.reply ||
        ("error" in exec
          ? `Couldn’t rebalance ${symbol}.`
          : `${parsed.intent === "trim" ? "Trimmed" : "Added"} ${symbol} and filled the paper book.`);
    } else {
      reply =
        parsed.reply ||
        `Proposed ${parsed.intent === "trim" ? "trim" : "add"} ${symbol}. Approve it below.`;
    }
  }

  const agentMsg = await prisma.pocketChat.create({
    data: { pocketId, authorType: "AGENT", body: reply }
  });
  return { user: userMsg, agent: agentMsg };
}
