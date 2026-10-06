import { generateText } from "ai";
import { prisma } from "@takeandstake/db";
import { applyGuardrails, executePaperRebalance, publicCommentBody } from "@takeandstake/core";
import { genObject } from "./generate.js";
import { criticModel, researchModel, socialModel } from "./llm.js";
import { fill, MANUS_MEMO_PROMPT, MONITOR_PROMPT, THREAD_REPLY_PROMPT, astrologyCanonExcerpt } from "./prompts/index.js";
import { monitorSchema, threadReplySchema } from "./prompts/schemas.js";
import { runWebNews } from "./web-research.js";

export async function runDailyMonitor(takeId: string) {
  const take = await prisma.take.findUnique({
    where: { id: takeId },
    include: {
      revisions: {
        orderBy: { number: "desc" },
        take: 1,
        include: { target: { include: { holdings: { include: { token: true } } } }, researchRun: { include: { thesis: true } } }
      },
      comments: { orderBy: { createdAt: "desc" }, take: 8 },
      pockets: { include: { mandate: true } }
    }
  });
  if (!take) throw new Error("take_not_found");
  const rev = take.revisions[0];
  const holdings = rev?.target?.holdings ?? [];
  const sky =
    take.lens === "SKY"
      ? JSON.stringify({
          system: take.astrologySystem ?? "WESTERN",
          chart: rev?.astrologyChart ?? "",
          date: new Date().toISOString().slice(0, 10),
          canon: astrologyCanonExcerpt(take.astrologySystem === "VEDIC" ? "VEDIC" : "WESTERN")
        })
      : "";
  let evidence = "";
  try {
    evidence = await runWebNews(
      rev?.sentence ?? "",
      holdings.map((h) => h.token.symbol)
    );
  } catch {
    evidence = "No fresh web evidence this cycle.";
  }
  const cycle = await prisma.researchCycle.create({
    data: { takeId, date: new Date(), kind: "DAILY", status: "RUNNING" }
  });
  const mandateLabel = take.pockets.some((p) => p.mandate?.mode === "APPROVAL")
    ? "Ask first on some pockets; Autopilot elsewhere"
    : "Autopilot default";
  const out = await genObject({
    model: researchModel(),
    schema: monitorSchema,
    prompt: fill(MONITOR_PROMPT, {
      thesis: JSON.stringify({ sentence: rev?.sentence, thesis: rev?.researchRun?.thesis }),
      positions: JSON.stringify(holdings.map((h) => ({ symbol: h.token.symbol, weightBps: h.weightBps }))),
      evidence,
      sky,
      mandate: mandateLabel,
      driftThreshold: "200 bps"
    })
  });
  const bySymbol = new Map(holdings.map((h) => [h.token.symbol.toUpperCase(), h]));
  const proposal = {
    noChange: out.decision === "no_change",
    cashBps: rev?.target?.cashBps ?? 500,
    holdings: out.trades.map((t) => ({
      tokenId: bySymbol.get(t.symbol.toUpperCase())?.tokenId ?? t.symbol,
      action: (t.action === "exit" ? "remove" : t.action === "add" ? "add" : t.action === "trim" || t.action === "decrease" ? "decrease" : "increase") as
        | "keep"
        | "increase"
        | "decrease"
        | "add"
        | "remove",
      conviction: 0.6,
      reason: t.reason,
      evidenceIds: t.sourceIds,
      tiedToTakeAction: true
    }))
  };
  const guard = applyGuardrails(
    proposal,
    holdings.map((h) => ({ tokenId: h.tokenId, weightBps: h.weightBps })),
    {
      maxTurnoverDailyBps: 1000,
      maxTurnoverWeeklyBps: 2500,
      allowNewNames: true,
      maxNewNamesPerWeek: 2,
      cashMinBps: 0,
      cashMaxBps: 2000,
      skipTradeUsd: 5
    },
    {}
  );
  const decision = await prisma.agentDecision.create({
    data: {
      cycleId: cycle.id,
      takeId,
      level: "TAKE",
      proposal: out,
      guardrailResult: guard,
      status: out.decision === "no_change" || !guard.ok ? "NO_CHANGE" : "PROPOSED",
      reasoning: out.thesisHealthReason
    }
  });
  if (out.decision !== "no_change" && guard.ok) {
    const weights = guard.weights.filter((w) => w.tokenId !== "CASH");
    for (const pocket of take.pockets.filter((p) => p.status === "ACTIVE" && p.mode !== "WATCH")) {
      const askFirst = pocket.mandate?.mode === "APPROVAL";
      const row = await prisma.rebalanceProposal.create({
        data: {
          pocketId: pocket.id,
          agentDecisionId: decision.id,
          trigger: out.decision,
          trades: { trades: out.trades, weights, cashBps: guard.cashBps },
          estCostUsd: 0,
          status: askFirst ? "PENDING" : "PENDING",
          expiresAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000)
        }
      });
      if (!askFirst && pocket.mode === "DRY_RUN") {
        const env = {
          ZEROX_API_KEY: process.env.ZEROX_API_KEY,
          ORACLE_MAX_DEVIATION: process.env.ORACLE_MAX_DEVIATION
            ? Number(process.env.ORACLE_MAX_DEVIATION)
            : 0.015
        };
        const exec = await executePaperRebalance(pocket.id, env, weights, {
          proposalId: row.id,
          cashBps: guard.cashBps,
          changeSummary: out.post.slice(0, 280)
        });
        if (!("error" in exec)) {
          await prisma.agentDecision.update({
            where: { id: decision.id },
            data: { finalTargetId: exec.targetId, status: "EXECUTED" }
          });
        }
      } else if (pocket.mode === "LIVE") {
        await prisma.rebalanceProposal.update({
          where: { id: row.id },
          data: { status: "PENDING" }
        });
      }
      await prisma.notification.create({
        data: {
          userId: pocket.userId,
          type: askFirst ? "approval" : "decision",
          payload: { takeId, proposalId: row.id, decision: out.decision, post: out.post }
        }
      });
    }
  }
  await prisma.dailyBrief.create({
    data: {
      cycleId: cycle.id,
      takeId,
      summary: out.post,
      thesisHealth: out.thesisHealth,
      whatChanged: out.trades.map((t) => `${t.symbol} ${t.action}`),
      marketNote: evidence.slice(0, 500)
    }
  });
  const brief = publicCommentBody(out.post);
  if (brief) {
    await prisma.comment.create({
      data: {
        takeId,
        revisionId: take.currentRevisionId,
        authorType: "AGENT",
        kind: "AGENT_BRIEF",
        body: brief
      }
    });
  }
  await prisma.researchCycle.update({ where: { id: cycle.id }, data: { status: "DONE", finishedAt: new Date() } });
  return out;
}

export async function replyToComment(commentId: string) {
  const comment = await prisma.comment.findUnique({
    where: { id: commentId },
    include: {
      take: {
        include: {
          revisions: { orderBy: { number: "desc" }, take: 1, include: { target: { include: { holdings: { include: { token: true } } } }, researchRun: { include: { thesis: true } } } },
          comments: { orderBy: { createdAt: "desc" }, take: 12 }
        }
      }
    }
  });
  if (!comment) throw new Error("comment_not_found");
  const rev = comment.take.revisions[0];
  const out = await genObject({
    model: socialModel(),
    schema: threadReplySchema,
    prompt: fill(THREAD_REPLY_PROMPT, {
      view: rev?.sentence ?? "",
      basket: JSON.stringify(rev?.target?.holdings.map((h) => ({ symbol: h.token.symbol, weightBps: h.weightBps, why: h.rationale })) ?? []),
      research: JSON.stringify(rev?.researchRun?.thesis ?? {}),
      thread: comment.take.comments
        .slice()
        .reverse()
        .map((c) => `${c.authorType}: ${c.body}`)
        .join("\n")
        .slice(-2500),
      comment: comment.body
    })
  });
  const reply = publicCommentBody(out.body);
  if (!reply) return null;
  return prisma.comment.create({
    data: {
      takeId: comment.takeId,
      revisionId: comment.revisionId,
      parentId: comment.id,
      authorType: "AGENT",
      kind: comment.kind === "QUESTION" ? "UPDATE" : "AGENT_BRIEF",
      body: reply
    }
  });
}

export async function writeManusMemo(takeId: string) {
  const take = await prisma.take.findUnique({
    where: { id: takeId },
    include: {
      revisions: {
        orderBy: { number: "desc" },
        take: 1,
        include: { target: { include: { holdings: { include: { token: true } } } }, researchRun: { include: { thesis: true, candidates: { include: { score: true } } } } }
      }
    }
  });
  if (!take) return null;
  const rev = take.revisions[0];
  const prompt = fill(MANUS_MEMO_PROMPT, {
    view: rev?.sentence ?? "",
    interpretation: rev?.researchRun?.thesis?.interpretation ?? "",
    holdings: JSON.stringify(rev?.target?.holdings ?? []),
    evidence: JSON.stringify(rev?.researchRun?.candidates.map((c) => c.score?.rationale) ?? [])
  });
  let body = "";
  const manus = process.env.MANUS_API_KEY?.trim();
  if (manus) {
    try {
      const res = await fetch("https://api.manus.im/v1/tasks", {
        method: "POST",
        headers: { authorization: `Bearer ${manus}`, "content-type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const text = await res.text();
      body = res.ok ? publicCommentBody(text) ?? "" : "";
    } catch {
      body = "";
    }
  }
  if (!body) {
    const text = await generateText({
      model: criticModel() as never,
      prompt
    });
    body = publicCommentBody(text.text) ?? "";
  }
  if (!body) return null;
  return prisma.comment.create({
    data: {
      takeId,
      revisionId: take.currentRevisionId,
      authorType: "AGENT",
      kind: "UPDATE",
      body: body.slice(0, 8000),
      isPinned: true
    }
  });
}
