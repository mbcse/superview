import { prisma } from "@takeandstake/db";
import { constructPortfolio, type HoldingRole } from "@takeandstake/core";
import { criticModel, researchModel } from "./llm.js";
import { genObject } from "./generate.js";
import {
  displaySymbol,
  log,
  deskOf,
  parseChainId,
  parseWorld,
  sanitizeCatalogText,
  MEME_MIN_LIQUIDITY_USD,
  MEME_MIN_AGE_MS,
  MEME_MAX_TOP_HOLDERS,
  MEME_MAX_DEV_BALANCE,
  MEME_MIN_HOLDINGS,
  type World
} from "@takeandstake/shared";
import { cosine, embedText } from "./embed.js";
import { matchNameToUniverse } from "./universe-match.js";
import { screenCatalog, orderByThesis } from "./screen.js";
import { factsFromCompany, saveResearchNotes, thesisKey, thesisNoteFromCompany } from "./company-cache.js";
import { clearCheckpoint, mergePicks, parseCheckpoint, patchCheckpoint } from "./checkpoint.js";
import { runWebDiligence, runWebDiscover } from "./web-research.js";
import { refusedSpec, shouldRefuseView } from "./view-guard.js";
import {
  ANALYST_PROMPT,
  CRITIC_PROMPT,
  INTERPRETER_PROMPT,
  MEME_INTERPRETER_PROMPT,
  ASTROLOGY_INTERPRETER_PROMPT,
  MEME_SCREENER_PROMPT,
  PORTFOLIO_MANAGER_PROMPT,
  PROMPT_VERSION,
  astrologyCanon,
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

const RINGS = new Set(["direct", "indirect", "shared_interest", "hedge"]);

function placeholderAnalystItem(p: { symbol: string; reason?: string; ring?: string }): AnalystItem {
  const role = p.ring && RINGS.has(p.ring) ? (p.ring as AnalystItem["role"]) : "indirect";
  const why = (p.reason ?? "").trim() || `${p.symbol} fits the view.`;
  return {
    symbol: p.symbol,
    exposurePurity: 0.5,
    directness: 0.5,
    quality: 0.5,
    valuationRoom: 0.5,
    riskPenalty: 0.4,
    confidence: 0.35,
    role,
    whyInBasket: why,
    bullPoints: [why].slice(0, 3),
    bearPoints: ["Evidence was thin on this pass."],
    whatWouldMakeUsSell: "The thesis no longer holds.",
    sourceIds: []
  };
}

async function scoreAnalystSlice(
  slice: Array<{ symbol: string; reason: string; ring: string }>,
  promptHead: string,
  bySymbol: Map<string, { legalName?: string; sector?: string | null; businessSummary?: string }>,
  diligence: Map<string, string>
): Promise<{ items: AnalystItem[] }> {
  if (!slice.length) return { items: [] };
  try {
    return await genObject({
      model: researchModel(),
      schema: analystBatchSchema,
      label: "analyst",
      prompt:
        promptHead +
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
  } catch {
    if (slice.length <= 1) {
      log("ai", "analyst fallback", { symbol: slice[0]?.symbol });
      return { items: slice.map(placeholderAnalystItem) };
    }
    const mid = Math.ceil(slice.length / 2);
    const left = await scoreAnalystSlice(slice.slice(0, mid), promptHead, bySymbol, diligence);
    const right = await scoreAnalystSlice(slice.slice(mid), promptHead, bySymbol, diligence);
    return { items: [...left.items, ...right.items] };
  }
}

export async function runResearchPipeline(runId: string, emit: ResearchEmitter = async () => {}) {
  const run = await prisma.researchRun.findUnique({
    where: { id: runId },
    include: { take: { include: { revisions: { orderBy: { number: "desc" }, take: 1 } } } }
  });
  if (!run) throw new Error("run_not_found");

  const rev = run.take?.revisions?.[0];
  const lens = run.take?.lens === "SKY" ? "SKY" : "BELIEF";
  const astrologySystem = run.take?.astrologySystem === "VEDIC" ? "VEDIC" : "WESTERN";
  const chart = (rev?.astrologyChart ?? "").trim();
  const versions = (run.modelVersions as {
    view?: string;
    skyHeadlineProvided?: boolean;
  } | null) ?? {};
  const view =
    lens === "SKY"
      ? chart || (rev?.sentence as string | undefined) || String(versions.view ?? "")
      : ((rev?.sentence as string | undefined) ?? String(versions.view ?? ""));
  if (!view.trim()) throw new Error("missing_view");

  const world: World = parseWorld(run.world ?? run.take?.world);
  const chainId = parseChainId(run.chainId ?? run.take?.chainId, world);
  const desk = deskOf(world, chainId).title;
  const launchBet = /launch|just launched|new coin|bonding/i.test(view);
  const listed = await prisma.stockToken.findMany({
    where: { status: "ACTIVE", world, chainId },
    include: { universe: true }
  });
  const flagged = listed.filter((t) => {
    if (world !== "MEMES") return true;
    const flags = (t.riskFlags ?? {}) as {
      mintAuthorityDisabled?: boolean;
      freezeAuthorityDisabled?: boolean;
      topHolders?: number | null;
      devBalance?: number | null;
      isSus?: boolean;
    };
    if (!launchBet && t.launchedAt && Date.now() - t.launchedAt.getTime() < MEME_MIN_AGE_MS) return false;
    if (flags.mintAuthorityDisabled === false) return false;
    if (flags.freezeAuthorityDisabled === false) return false;
    if ((flags.topHolders ?? 0) > MEME_MAX_TOP_HOLDERS) return false;
    if ((flags.devBalance ?? 0) > MEME_MAX_DEV_BALANCE) return false;
    if (flags.isSus) return false;
    return true;
  });
  const tokens = (() => {
    if (world !== "MEMES") return flagged;
    const ranked = [...flagged].sort((a, b) => Number(b.liquidityUsd ?? 0) - Number(a.liquidityUsd ?? 0));
    const liquid = ranked.filter((t) => Number(t.liquidityUsd ?? 0) >= MEME_MIN_LIQUIDITY_USD);
    return liquid.length >= 16 ? liquid : ranked.slice(0, 40);
  })();
  const universe = tokens.map((t) => ({
    id: t.universe?.id ?? t.id,
    tokenId: t.id,
    symbol: t.symbol,
    legalName: sanitizeCatalogText(t.universe?.legalName ?? t.name, 80),
    businessSummary: `CATALOG_DATA: "${sanitizeCatalogText(t.universe?.businessSummary ?? t.name, 280)}"`,
    sector: t.universe?.sector ?? (world === "MEMES" ? "meme" : null),
    halt: t.isTradingHalt,
    embedding: Array.isArray(t.universe?.embedding) ? (t.universe!.embedding as number[]) : [],
    tags: t.universe?.tags ?? t.riskFlags,
    profile: t.universe?.profile,
    refreshedAt: t.universe?.refreshedAt ?? t.updatedAt
  }));
  log("ai", "research start", { run: runId, view, world, chainId, universe: universe.length });
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
  } else if (lens !== "SKY" && shouldRefuseView(view)) {
    spec = refusedSpec(view);
    await emit("interpret", "This is not a readable view");
  } else {
    await emit("interpret", lens === "SKY" ? "Reading the sky" : "Reading your view");
    spec = await genObject({
      model: researchModel(),
      schema: interpreterSchema,
      label: "interpret",
      prompt:
        lens === "SKY"
          ? fill(ASTROLOGY_INTERPRETER_PROMPT, {
              view,
              headline: versions.skyHeadlineProvided ? String(rev?.sentence ?? "") : "",
              date: new Date().toISOString().slice(0, 10),
              system: astrologySystem,
              canon: astrologyCanon(astrologySystem),
              desk,
              marketContext:
                world === "MEMES"
                  ? `Launchpad memecoins on ${desk}. Culture and community, not earnings.`
                  : `Stock tokens on ${desk}.`
            })
          : fill(world === "MEMES" ? MEME_INTERPRETER_PROMPT : INTERPRETER_PROMPT, {
              view,
              date: new Date().toISOString().slice(0, 10),
              desk,
              marketContext:
                world === "MEMES"
                  ? `Launchpad memecoins on ${desk}. Culture and community, not earnings.`
                  : `Stock tokens on ${desk}.`
            })
    });
    await patchCheckpoint(runId, { spec });
    if (lens === "SKY" && spec.normalizedView && !versions.skyHeadlineProvided && rev?.id) {
      await prisma.takeRevision.update({
        where: { id: rev.id },
        data: { sentence: spec.normalizedView.slice(0, 280) }
      });
    }
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
  await emit("interpret", "Thesis ready", { spec, suggestWorld: spec.suggestWorld });

  await setStage(runId, "SCREENING", "retrieve");
  const qEmb = await embedText(`${spec.normalizedView} ${spec.interpretation} ${spec.mechanism}`);
  const skip = new Set((cp0.screenedSymbols ?? []).map((s) => s.toUpperCase()));
  let relevant = mergePicks([], cp0.picks);
  if (skip.size < universe.length) {
    const remaining = Math.min(80, Math.max(0, universe.length - skip.size));
    await emit("retrieve", world === "MEMES"
      ? `Reading ${remaining} remaining launchpad coins on ${desk}`
      : `Reading ${remaining} remaining names on ${desk}`);
    const more = await screenCatalog({
      universe,
      interpretation: spec.interpretation,
      mechanism: spec.mechanism,
      angles: spec.angles,
      queryEmbedding: qEmb,
      skipSymbols: skip,
      desk,
      prompt: world === "MEMES" ? MEME_SCREENER_PROMPT : undefined,
      onBatch: async (info) => {
        await patchCheckpoint(runId, { picks: info.batchPicks, screenedSymbols: info.batchSymbols });
        await emit("retrieve", `Screened ${info.done}/${info.total} remaining batches · ${info.found + relevant.length} relevant`);
      }
    });
    relevant = mergePicks(relevant, more);
  } else {
    await emit("retrieve", world === "MEMES"
      ? `Reusing screen of ${relevant.length} coins`
      : `Reusing screen of ${relevant.length} companies`);
  }
  await emit("retrieve", world === "MEMES"
    ? `${relevant.length} coins look relevant`
    : `${relevant.length} companies look relevant`, { picks: relevant.slice(0, 24) });

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
        const hit = matchNameToUniverse(row.name, universe);
        discoveredNotes.push(
          hit
            ? `• ${row.name} → ${hit.symbol} (${angle?.name ?? "discover"})`
            : `• ${row.name} considered, not on this desk`
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
      const mapped = found.filter((row) => matchNameToUniverse(row.name, universe)).length;
      await emit(
        "discover",
        found.length
          ? world === "MEMES"
            ? `Mapped ${mapped} of ${found.length} search hits onto this desk`
            : `Matched ${found.length} extra names`
          : "Catalog screen covers this view",
        { found: found.map((f) => f.name) }
      );
    } catch (e) {
      await emit("discover", "Web search skipped", { error: String(e) });
      await patchCheckpoint(runId, { discoverDone: true, discoveredNotes });
    }
  }

  if (world === "MEMES") {
    const have = new Set(relevant.map((p) => p.symbol.toUpperCase()));
    const need = Math.max(MEME_MIN_HOLDINGS, Math.min(6, universe.length));
    for (const u of orderByThesis(universe, qEmb)) {
      if (relevant.length >= need) break;
      if (have.has(u.symbol.toUpperCase()) || u.halt) continue;
      have.add(u.symbol.toUpperCase());
      relevant.push({
        symbol: u.symbol,
        relevant: true,
        angle: "theme",
        ring: "shared_interest",
        reason: "On this desk and fits the launchpad theme"
      });
    }
    if (relevant.length) {
      await emit("retrieve", `Desk fill · ${relevant.length} coins in the working set`);
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
    const batchOut = await scoreAnalystSlice(
      slice,
      fill(ANALYST_PROMPT, {
        normalizedView: spec.normalizedView,
        interpretation: spec.interpretation,
        horizon: spec.horizon
      }),
      bySymbol,
      diligence
    );
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
          skyRead: spec.skyRead ?? "",
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
    .filter((s) => named.has(s.u.symbol.toUpperCase()) || named.has(displaySymbol(s.u.symbol).toUpperCase()))
    .map((s) => {
      const pmh =
        named.get(s.u.symbol.toUpperCase()) ?? named.get(displaySymbol(s.u.symbol).toUpperCase());
      return {
        tokenId: s.u.tokenId,
        symbol: s.u.symbol,
        actionId: s.u.tokenId,
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
    singleTickerAnchor: single,
    world
  });
  if (!constructed.ok) {
    constructed = constructPortfolio(
      scored.slice(0, 12).map((s) => ({
        tokenId: s.u.tokenId,
        symbol: s.u.symbol,
        actionId: s.u.tokenId,
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
      { singleTickerAnchor: single, world }
    );
  }
  if (!constructed.ok && world === "MEMES") {
    constructed = constructPortfolio(
      universe.filter((u) => !u.halt).slice(0, 8).map((u) => ({
        tokenId: u.tokenId,
        symbol: u.symbol,
        actionId: u.tokenId,
        sector: u.sector ?? undefined,
        exposure: 0.5,
        confidence: 0.5,
        halt: false,
        role: "shared_interest" as HoldingRole
      })),
      500,
      { world }
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
