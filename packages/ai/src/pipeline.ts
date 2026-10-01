import { prisma } from "@takeandstake/db";
import { constructPortfolio, type HoldingRole } from "@takeandstake/core";
import { criticModel, researchModel } from "./llm.js";
import { genObject } from "./generate.js";
import { log } from "@takeandstake/shared";
import { cosine, embedText } from "./embed.js";
import { matchParallelNameToUniverse } from "./universe-match.js";
import { screenCatalog } from "./screen.js";
import { factsFromCompany, saveResearchNotes, thesisKey, thesisNoteFromCompany } from "./company-cache.js";
import { clearCheckpoint, mergePicks, parseCheckpoint, patchCheckpoint } from "./checkpoint.js";
import { runWebDiligence, runWebDiscover } from "./web-research.js";
import {
  ANALYST_PROMPT,
  CRITIC_PROMPT,
  INTERPRETER_PROMPT,
  PORTFOLIO_MANAGER_PROMPT,
  PROMPT_VERSION,
  discoveryObjective,
  fill
} from "./prompts/index.js";
import {
  analystBatchSchema,
  criticSchema,
  interpreterSchema,
  portfolioManagerSchema,
  type AnalystItem
} from "./prompts/schemas.js";

export type ResearchEmitter = (stage: string, message: string, payload?: unknown) => Promise<void>;

export async function runResearchPipeline(runId: string, emit: ResearchEmitter = async () => {}) {
  const run = await prisma.researchRun.findUnique({
    where: { id: runId },
    include: { take: { include: { revisions: { orderBy: { number: "desc" }, take: 1 } } } }
  });
  if (!run) throw new Error("run_not_found");

  const view =
    (run.take?.revisions?.[0]?.sentence as string | undefined) ??
    String((run.modelVersions as { view?: string } | null)?.view ?? "");
  if (!view.trim()) throw new Error("missing_view");

  const companies = await prisma.universeCompany.findMany({
    include: { token: true },
    where: { token: { status: "ACTIVE", chainId: 4663 } }
  });
  const universe = companies.map((c) => ({
    id: c.id,
    tokenId: c.tokenId,
    symbol: c.token.symbol,
    legalName: c.legalName,
    businessSummary: c.businessSummary,
    sector: c.sector,
    halt: c.token.isTradingHalt,
    embedding: Array.isArray(c.embedding) ? (c.embedding as number[]) : [],
    tags: c.tags,
    profile: c.profile,
    refreshedAt: c.refreshedAt
  }));
  log("ai", "research start", { run: runId, view, universe: universe.length });
  const cp0 = parseCheckpoint(run.modelVersions);
  if (cp0.spec || (cp0.screenedSymbols?.length ?? 0) > 0) {
    log("ai", "research resume", {
      run: runId,
      screened: cp0.screenedSymbols?.length ?? 0,
      picks: cp0.picks?.length ?? 0,
      diligence: Object.keys(cp0.diligence ?? {}).length
    });
  }

  await setStage(runId, "INTERPRETING", "interpret");
  let spec = interpreterSchema.safeParse(cp0.spec).success ? cp0.spec! : undefined;
  if (spec) {
    await emit("interpret", "Reusing thesis from the last attempt");
  } else {
    await emit("interpret", "Reading your view");
    spec = await genObject({
      model: researchModel(),
      schema: interpreterSchema,
      label: "interpret",
      prompt: fill(INTERPRETER_PROMPT, {
        view,
        date: new Date().toISOString().slice(0, 10),
        marketContext: ""
      })
    });
    await patchCheckpoint(runId, { spec });
  }

  await prisma.thesisSpec.upsert({
    where: { runId },
    update: {
      normalizedTake: spec.normalizedView,
      interpretation: spec.interpretation,
      mechanism: spec.mechanism,
      horizon: spec.horizon,
      assumptions: spec.assumptions,
      falsifiers: spec.falsifiers,
      questions: spec.clarifyingQuestions,
      refuse: spec.refuse,
      refuseReason: spec.refuseReason
    },
    create: {
      runId,
      normalizedTake: spec.normalizedView,
      interpretation: spec.interpretation,
      mechanism: spec.mechanism,
      horizon: spec.horizon,
      assumptions: spec.assumptions,
      falsifiers: spec.falsifiers,
      questions: spec.clarifyingQuestions,
      refuse: spec.refuse,
      refuseReason: spec.refuseReason
    }
  });

  if (spec.refuse) {
    await prisma.researchRun.update({
      where: { id: runId },
      data: { status: "FAILED", stage: "refused", finishedAt: new Date(), error: spec.refuseReason ?? "refused" }
    });
    await emit("refuse", spec.refuseReason ?? "Could not build this view", spec);
    log("ai", "research refused", { run: runId, reason: spec.refuseReason });
    return { refused: true, spec };
  }

  const actionCount = await prisma.economicAction.count({ where: { runId } });
  if (!actionCount) {
    for (const [i, a] of spec.angles.entries()) {
      await prisma.economicAction.create({
        data: { runId, name: a.name, description: a.rationale, order: i }
      });
    }
  }
  await emit("interpret", "Thesis ready", { spec });

  await setStage(runId, "SCREENING", "retrieve");
  const qEmb = await embedText(`${spec.normalizedView} ${spec.interpretation} ${spec.mechanism}`);
  const skip = new Set((cp0.screenedSymbols ?? []).map((s) => s.toUpperCase()));
  let relevant = mergePicks([], cp0.picks);
  if (skip.size < universe.length) {
    await emit("retrieve", `Reading ${universe.length - skip.size} remaining Robinhood Chain names`);
    const more = await screenCatalog({
      universe,
      interpretation: spec.interpretation,
      mechanism: spec.mechanism,
      angles: spec.angles,
      queryEmbedding: qEmb,
      skipSymbols: skip,
      onBatch: async (info) => {
        await patchCheckpoint(runId, { picks: info.batchPicks, screenedSymbols: info.batchSymbols });
        await emit("retrieve", `Screened ${info.done}/${info.total} remaining batches · ${info.found + relevant.length} relevant`);
      }
    });
    relevant = mergePicks(relevant, more);
  } else {
    await emit("retrieve", `Reusing screen of ${relevant.length} companies`);
  }
  await emit("retrieve", `${relevant.length} companies look relevant`, { picks: relevant.slice(0, 24) });

  await setStage(runId, "DISCOVERING", "discover");
  const discoveredNotes: string[] = [...(cp0.discoveredNotes ?? [])];
  const bySymbol = new Map(universe.map((u) => [u.symbol.toUpperCase(), u]));
  const catalogEnough = relevant.length >= 6;
  if (cp0.discoverDone || catalogEnough) {
    if (!cp0.discoverDone) {
      await patchCheckpoint(runId, { discoverDone: true, discoveredNotes });
    }
    await emit("discover", catalogEnough ? "Catalog screen covers this view" : "Reusing last search");
  } else {
    try {
      const angle = spec.angles[0];
      await emit("discover", "Web search for extra names");
      const found = angle ? await runWebDiscover(discoveryObjective(spec.interpretation, angle), 8) : [];
      for (const row of found) {
        const hit = matchParallelNameToUniverse(row.name, universe);
        discoveredNotes.push(
          hit
            ? `• ${row.name} → ${hit.symbol} (${angle?.name ?? "discover"})`
            : `• ${row.name} considered, not on Robinhood Chain`
        );
        if (hit && !relevant.some((p) => p.symbol.toUpperCase() === hit.symbol.toUpperCase())) {
          relevant.push({
            symbol: hit.symbol,
            relevant: true,
            angle: angle?.name ?? "",
            ring: angle?.ring ?? "indirect",
            reason: row.description ?? "Discovered for the thesis"
          });
        }
      }
      await patchCheckpoint(runId, { discoveredNotes, discoverDone: true, picks: relevant });
      await emit("discover", found.length ? `Matched ${found.length} extra names` : "Catalog screen covers this view", {
        found: found.map((f) => f.name)
      });
    } catch (e) {
      await emit("discover", "Web search skipped", { error: String(e) });
      await patchCheckpoint(runId, { discoverDone: true, discoveredNotes });
    }
  }

  const uniqueSymbols = [...new Map(relevant.map((p) => [p.symbol.toUpperCase(), p])).values()]
    .sort((a, b) => {
      const ua = bySymbol.get(a.symbol.toUpperCase());
      const ub = bySymbol.get(b.symbol.toUpperCase());
      return cosine(qEmb, ub?.embedding ?? []) - cosine(qEmb, ua?.embedding ?? []);
    })
    .slice(0, 24);
  await setStage(runId, "DILIGENCE", "diligence");
  const diligence = new Map<string, string>(Object.entries(cp0.diligence ?? {}));
  const tKey = thesisKey(spec.interpretation);
  for (const p of uniqueSymbols) {
    const u = bySymbol.get(p.symbol.toUpperCase());
    if (!u) continue;
    const existing = diligence.get(u.symbol) ?? diligence.get(p.symbol.toUpperCase());
    if (existing) continue;
    const cachedThesis = thesisNoteFromCompany(u.profile, tKey);
    if (cachedThesis) {
      diligence.set(u.symbol, cachedThesis);
      await emit("diligence", `Reused stored research for ${u.symbol}`, { symbol: u.symbol, cached: true });
    }
  }
  const missing = uniqueSymbols.filter((p) => {
    const u = bySymbol.get(p.symbol.toUpperCase());
    if (!u) return false;
    return !(diligence.get(u.symbol) ?? diligence.get(p.symbol.toUpperCase()));
  }).slice(0, 16);
  if (missing.length) {
    try {
      await emit("diligence", `Web research on ${missing.length} names`);
      const notes = await runWebDiligence({
        interpretation: spec.interpretation,
        mechanism: spec.mechanism,
        angles: spec.angles,
        companies: missing.map((p) => {
          const u = bySymbol.get(p.symbol.toUpperCase())!;
          const facts = factsFromCompany(u);
          return { symbol: u.symbol, legalName: u.legalName, sector: u.sector, known: facts.text || u.businessSummary };
        })
      });
      const written: Record<string, string> = {};
      for (const p of missing) {
        const u = bySymbol.get(p.symbol.toUpperCase());
        if (!u) continue;
        const note =
          notes[u.symbol] ?? notes[p.symbol.toUpperCase()] ?? (factsFromCompany(u).text || u.businessSummary);
        diligence.set(u.symbol, note);
        written[u.symbol] = note;
        if (notes[u.symbol] || notes[p.symbol.toUpperCase()]) {
          u.profile = await saveResearchNotes(u.id, u.profile, { thesisKey: tKey, thesisText: note });
        }
      }
      await patchCheckpoint(runId, { diligence: { ...Object.fromEntries(diligence), ...written } });
      await emit("diligence", `Researched basket of ${Object.keys(written).length} names`);
    } catch (e) {
      await emit("diligence", "Web research incomplete · using catalog notes", { error: String(e) });
      for (const p of missing) {
        const u = bySymbol.get(p.symbol.toUpperCase());
        if (!u) continue;
        if (diligence.get(u.symbol) ?? diligence.get(p.symbol.toUpperCase())) continue;
        const note = factsFromCompany(u).text || u.businessSummary;
        diligence.set(u.symbol, note);
      }
      await patchCheckpoint(runId, { diligence: Object.fromEntries(diligence) });
    }
  }

  await setStage(runId, "ANALYST", "analyst");
  const analystItems: AnalystItem[] = [...(cp0.analystItems ?? [])];
  const scoredAlready = new Set(analystItems.map((i) => i.symbol.toUpperCase()));
  const analystRemaining = uniqueSymbols.filter((p) => !scoredAlready.has(p.symbol.toUpperCase()));
  if (!analystRemaining.length && analystItems.length) {
    await emit("analyst", `Reusing scores for ${analystItems.length} names`);
  }
  for (let i = 0; i < analystRemaining.length; i += 8) {
    const slice = analystRemaining.slice(i, i + 8);
    const batchOut = await genObject({
      model: researchModel(),
      schema: analystBatchSchema,
      label: "analyst",
      prompt: fill(ANALYST_PROMPT, {
        normalizedView: spec.normalizedView,
        interpretation: spec.interpretation,
        horizon: spec.horizon
      }) +
        `\nCandidates:\n` +
        slice
          .map((p) => {
            const u = bySymbol.get(p.symbol.toUpperCase());
            return JSON.stringify({
              symbol: p.symbol,
              name: u?.legalName,
              sector: u?.sector,
              reason: p.reason,
              ring: p.ring,
              diligence: diligence.get(p.symbol) ?? diligence.get(p.symbol.toUpperCase()) ?? u?.businessSummary
            });
          })
          .join("\n")
    });
    analystItems.push(...batchOut.items);
    await patchCheckpoint(runId, { analystItems });
    await emit("analyst", `Scored ${analystItems.length} names`);
  }

  const scored = analystItems
    .map((item) => {
      const u = bySymbol.get(item.symbol.toUpperCase());
      if (!u) return null;
      return { item, u };
    })
    .filter(Boolean) as Array<{ item: AnalystItem; u: (typeof universe)[number] }>;

  await setStage(runId, "PORTFOLIO", "portfolio");
  const pm = cp0.pm && !analystRemaining.length
    ? cp0.pm
    : await genObject({
        model: researchModel(),
        schema: portfolioManagerSchema,
        label: "portfolio",
        prompt: fill(PORTFOLIO_MANAGER_PROMPT, {
          thesis: JSON.stringify({
            view: spec.normalizedView,
            interpretation: spec.interpretation,
            horizon: spec.horizon,
            falsifiers: spec.falsifiers
          }),
          analystOutput: JSON.stringify(analystItems),
          roleMix: "direct ≥ 40%, indirect ≤ 45%, shared_interest ≤ 25%, hedge ≤ 10%",
          liquidity: "use halt flags; skip halted names"
        })
      });
  if (!cp0.pm || analystRemaining.length) await patchCheckpoint(runId, { pm });

  let criticIssues = "";
  await setStage(runId, "CRITIC", "critic");
  const critic = cp0.critic && !analystRemaining.length
    ? cp0.critic
    : await genObject({
        model: criticModel(),
        schema: criticSchema,
        label: "critic",
        prompt: fill(CRITIC_PROMPT, {
          view,
          portfolio: JSON.stringify(pm),
          evidence: discoveredNotes.slice(0, 40).join("\n")
        })
      });
  if (!cp0.critic || analystRemaining.length) await patchCheckpoint(runId, { critic });
  await emit("critic", critic.verdict === "approve" ? "Risk officer approved" : "Revising the basket", critic);
  if (critic.verdict === "revise" && !(cp0.critic && !analystRemaining.length)) {
    criticIssues = JSON.stringify(critic.issues);
    const revised = await genObject({
      model: researchModel(),
      schema: portfolioManagerSchema,
      label: "revise",
      prompt:
        fill(PORTFOLIO_MANAGER_PROMPT, {
          thesis: JSON.stringify(spec),
          analystOutput: JSON.stringify(analystItems),
          roleMix: "direct ≥ 40%",
          liquidity: "skip halted"
        }) + `\nAddress these issues:\n${criticIssues}`
    });
    Object.assign(pm, revised);
    await patchCheckpoint(runId, { pm, critic });
  }

  const named = new Map(pm.holdings.map((h) => [h.symbol.toUpperCase(), h]));
  const candidates = scored
    .filter((s) => named.has(s.u.symbol.toUpperCase()) || named.has(s.u.symbol.replace(/^RH/i, "").toUpperCase()))
    .map((s) => {
      const pmh =
        named.get(s.u.symbol.toUpperCase()) ?? named.get(s.u.symbol.replace(/^RH/i, "").toUpperCase());
      return {
        tokenId: s.u.tokenId,
        symbol: s.u.symbol,
        actionId: s.item.role,
        sector: s.u.sector ?? undefined,
        exposure: s.item.exposurePurity * s.item.directness,
        confidence: s.item.confidence,
        halt: s.u.halt,
        role: s.item.role as HoldingRole,
        purity: s.item.exposurePurity,
        quality: s.item.quality,
        riskPenalty: s.item.riskPenalty,
        proposedWeightPct: pmh?.weightPct
      };
    });

  const single = /nvda|tsla|aapl|msft|amd|meta|googl/i.test(view) && spec.angles.length <= 3;
  let constructed = constructPortfolio(candidates, Math.round((pm.cashPct / 100) * 10_000), {
    singleTickerAnchor: single
  });
  if (!constructed.ok) {
    constructed = constructPortfolio(
      scored.slice(0, 12).map((s) => ({
        tokenId: s.u.tokenId,
        symbol: s.u.symbol,
        actionId: s.item.role,
        sector: s.u.sector ?? undefined,
        exposure: Math.max(0.3, s.item.exposurePurity),
        confidence: Math.max(0.4, s.item.confidence),
        halt: s.u.halt,
        role: s.item.role as HoldingRole,
        purity: s.item.exposurePurity,
        quality: s.item.quality,
        riskPenalty: s.item.riskPenalty
      })),
      500,
      { singleTickerAnchor: single }
    );
  }
  if (!constructed.ok) {
    await prisma.researchRun.update({
      where: { id: runId },
      data: { status: "FAILED", stage: "draft", finishedAt: new Date(), error: "insufficient_eligible" }
    });
    await emit("failed", "Could not size a basket from the catalog");
    log("ai", "research failed", { run: runId, reason: "insufficient_eligible" });
    return { refused: false, spec, constructed };
  }

  await prisma.candidateCompany.deleteMany({ where: { runId } });
  const actions = await prisma.economicAction.findMany({ where: { runId } });
  const actionId = actions[0]?.id;
  for (const h of constructed.holdings) {
    const scoredH = scored.find((s) => s.u.tokenId === h.tokenId);
    const created = await prisma.candidateCompany.create({
      data: {
        runId,
        actionId,
        name: scoredH?.u.legalName ?? h.symbol,
        resolvedTokenId: h.tokenId,
        holdable: true,
        provider: "openai+search",
        score: {
          create: {
            directness: scoredH?.item.directness ?? 0.5,
            purityLow: scoredH?.item.exposurePurity ?? 0.4,
            purityHigh: scoredH?.item.exposurePurity ?? 0.4,
            sensitivity: 0.5,
            confidence: scoredH?.item.confidence ?? 0.5,
            exposure: h.score,
            quality: scoredH?.item.quality ?? 0.5,
            valuationRoom: scoredH?.item.valuationRoom ?? 0.5,
            riskPenalty: scoredH?.item.riskPenalty ?? 0.2,
            role: h.role,
            rationale: scoredH?.item.whyInBasket ?? "",
            whyInBasket: scoredH?.item.whyInBasket ?? "",
            bullPoints: scoredH?.item.bullPoints ?? [],
            bearPoints: scoredH?.item.bearPoints ?? []
          }
        }
      }
    });
    void created;
  }

  await clearCheckpoint(runId, {
    prompt: PROMPT_VERSION,
    view,
    pm,
    critic,
    diffs: constructed.diffs,
    constructed: { cashBps: constructed.cashBps, holdings: constructed.holdings },
    notes: discoveredNotes,
    basketThesis: pm.basketThesis,
    keyRisks: pm.keyRisks,
    expectedBehavior: pm.expectedBehavior
  });
  await prisma.researchRun.update({
    where: { id: runId },
    data: {
      status: "DRAFT",
      stage: "draft",
      finishedAt: new Date(),
      error: null
    }
  });
  await emit("draft", "Basket ready", {
    holdings: constructed.holdings,
    cashBps: constructed.cashBps,
    thesis: pm.basketThesis
  });
  log("ai", "research draft", { run: runId, holdings: constructed.holdings.length });
  return { refused: false, spec, constructed, pm, critic };
}

async function setStage(runId: string, status: "INTERPRETING" | "SCREENING" | "DISCOVERING" | "DILIGENCE" | "ANALYST" | "PORTFOLIO" | "CRITIC", stage: string) {
  await prisma.researchRun.update({ where: { id: runId }, data: { status, stage } });
}
