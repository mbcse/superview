import { prisma } from "@takeandstake/db";
import { fetchZeroXQuote, quoteUsdPerToken, ROBINHOOD_CHAIN_ID, USDG_MAINNET } from "@takeandstake/chain";
import { applyFill } from "./ledger.js";
import { canonicalReceipt } from "../takes/receipt.js";
import { computePocketMark } from "./tick.js";
import { latestPrice } from "../market/prices.js";
import { planRebalanceTrades } from "./rebalance.js";
import { quoteWithinOracle } from "../execution/checks.js";

export type PaperEnv = {
  ZEROX_API_KEY?: string;
  ORACLE_MAX_DEVIATION?: number;
};

const TOKEN_DECIMALS = 18;
const USDG_DECIMALS = 6;

function isHexAddress(addr: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

function paperBuyAmount(sellMicroUsd: bigint, priceUsd: number): string {
  const usd = Number(sellMicroUsd) / 10 ** USDG_DECIMALS;
  const qty = usd / Math.max(priceUsd, 0.01);
  return BigInt(Math.floor(qty * 10 ** TOKEN_DECIMALS)).toString();
}

function paperSellAmount(usd: number, priceUsd: number): bigint {
  const qty = usd / Math.max(priceUsd, 0.01);
  return BigInt(Math.floor(qty * 10 ** TOKEN_DECIMALS));
}

export type WeightTarget = { tokenId: string; weightBps: number; rationale?: string };

type PreparedFill = {
  tokenId: string;
  symbol: string;
  side: "BUY" | "SELL";
  sellAmount: bigint;
  buyAmount: string;
  usd: number;
  implied: number;
  quoteJson: object;
  skip?: string;
};

async function priceForToken(tokenId: string, env: PaperEnv, sellMicroUsd: bigint, contractAddress: string) {
  const snap = await latestPrice(tokenId);
  const rhAsk = snap ? Number(snap.ask ?? snap.price) : null;
  const chainlink = await prisma.priceSnapshot.findFirst({
    where: { tokenId, source: "CHAINLINK" },
    orderBy: { observedAt: "desc" }
  });
  const oracle = chainlink ? Number(chainlink.price) : rhAsk;
  if (rhAsk == null && oracle == null) return { skip: "no_price" as const };

  let implied = rhAsk ?? oracle ?? 0;
  let buyAmount = paperBuyAmount(sellMicroUsd, implied);
  let quoteJson: object = { mode: "paper_rh_ask", priceUsd: implied };
  const maxDev = env.ORACLE_MAX_DEVIATION ?? 0.015;

  if (env.ZEROX_API_KEY && isHexAddress(contractAddress) && sellMicroUsd > 0n) {
    try {
      const quote = await fetchZeroXQuote({
        apiKey: env.ZEROX_API_KEY,
        chainId: ROBINHOOD_CHAIN_ID,
        sellToken: USDG_MAINNET,
        buyToken: contractAddress,
        sellAmount: sellMicroUsd.toString(),
        firm: false
      });
      implied = quoteUsdPerToken(quote, 6, 18);
      if (oracle != null && !quoteWithinOracle(implied, oracle, maxDev)) {
        return { skip: "oracle_offside" as const };
      }
      buyAmount = quote.buyAmount;
      quoteJson = quote as object;
    } catch {
      implied = rhAsk ?? oracle ?? 0;
      buyAmount = paperBuyAmount(sellMicroUsd, implied);
      quoteJson = { mode: "paper_rh_ask", priceUsd: implied };
    }
  }
  return { implied, buyAmount, quoteJson };
}

async function writeFills(opts: {
  pocketId: string;
  cashId: string;
  orderId: string;
  fills: PreparedFill[];
}) {
  return prisma.$transaction(async (tx) => {
    let filled = 0;
    let skipped = 0;
    const legsOut: Array<{ symbol: string; status: string; skip?: string }> = [];
    for (const fill of opts.fills) {
      if (fill.skip) {
        skipped += 1;
        await tx.orderLeg.create({
          data: {
            orderId: opts.orderId,
            side: fill.side,
            tokenId: fill.tokenId,
            sellAmount: fill.sellAmount.toString(),
            status: "SKIPPED",
            skipReason: fill.skip
          }
        });
        legsOut.push({ symbol: fill.symbol, status: "SKIPPED", skip: fill.skip });
        continue;
      }
      const pos = await tx.ledgerAccount.upsert({
        where: { pocketId_kind_tokenId: { pocketId: opts.pocketId, kind: "POSITION", tokenId: fill.tokenId } },
        update: {},
        create: { pocketId: opts.pocketId, kind: "POSITION", tokenId: fill.tokenId }
      });
      const cashDelta = fill.side === "BUY" ? -fill.sellAmount : fill.sellAmount;
      const tokenDelta =
        fill.side === "BUY" ? BigInt(fill.buyAmount) : -BigInt(fill.buyAmount || fill.sellAmount);
      const usd = fill.side === "BUY" ? fill.usd : -fill.usd;
      const lines = applyFill({
        cashAccountId: opts.cashId,
        positionAccountId: pos.id,
        cashDelta,
        tokenDelta,
        usd
      });
      const ledgerTx = await tx.ledgerTransaction.create({
        data: { pocketId: opts.pocketId, type: "FILL", orderLegId: undefined }
      });
      await tx.ledgerEntry.createMany({
        data: lines.map((l) => ({
          transactionId: ledgerTx.id,
          accountId: l.accountId,
          amount: l.amount.toString(),
          usdValue: l.usdValue
        }))
      });
      await tx.orderLeg.create({
        data: {
          orderId: opts.orderId,
          side: fill.side,
          tokenId: fill.tokenId,
          sellAmount: fill.sellAmount.toString(),
          status: "FILLED",
          quotes: {
            create: {
              quoteJson: fill.quoteJson,
              buyAmount: fill.buyAmount,
              price: fill.implied,
              expiresAt: new Date(Date.now() + 30_000)
            }
          }
        }
      });
      filled += 1;
      legsOut.push({ symbol: fill.symbol, status: "FILLED" });
    }
    const status = filled === 0 ? "FAILED" : skipped > 0 ? "PARTIAL" : "FILLED";
    await tx.order.update({ where: { id: opts.orderId }, data: { status } });
    return { filled, fills: filled, skipped, status, legs: legsOut };
  });
}

export async function depositPaperUsd(pocketId: string, usd: number) {
  const cash = await prisma.ledgerAccount.upsert({
    where: { pocketId_kind_tokenId: { pocketId, kind: "CASH", tokenId: "USDG" } },
    update: {},
    create: { pocketId, kind: "CASH", tokenId: "USDG" }
  });
  const amount = String(Math.round(usd * 1_000_000));
  await prisma.$transaction(async (tx) => {
    const ledgerTx = await tx.ledgerTransaction.create({
      data: { pocketId, type: "DEPOSIT" }
    });
    await tx.ledgerEntry.create({
      data: { transactionId: ledgerTx.id, accountId: cash.id, amount, usdValue: usd }
    });
    const backing = await tx.backing.findFirst({ where: { pocketId } });
    if (backing) {
      await tx.backing.update({
        where: { id: backing.id },
        data: { amountUsd: Number(backing.amountUsd ?? 0) + usd }
      });
    }
  });
  return { cashId: cash.id, usd };
}

export async function runDryRunInvest(pocketId: string, env: PaperEnv) {
  const pocket = await prisma.pocket.findUnique({
    where: { id: pocketId },
    include: {
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
  if (!pocket || pocket.mode !== "DRY_RUN") return { error: "not_found" as const };
  const target = pocket.take.revisions[0]?.target;
  if (!target) return { error: "no_target" as const };
  const cash = await prisma.ledgerAccount.findFirst({ where: { pocketId: pocket.id, kind: "CASH" } });
  if (!cash) return { error: "no_paper_usdg" as const };
  const entries = await prisma.ledgerEntry.findMany({ where: { accountId: cash.id } });
  const cashUnits = entries.reduce((s, e) => s + BigInt(e.amount.toFixed(0)), 0n);
  const order = await prisma.order.create({
    data: { pocketId: pocket.id, mode: "DRY_RUN", kind: "INVEST", status: "SUBMITTING" }
  });
  const prepared: PreparedFill[] = [];
  for (const h of target.holdings) {
    const sell = (cashUnits * BigInt(h.weightBps)) / 10_000n;
    if (sell < 5_000_000n) {
      prepared.push({
        tokenId: h.tokenId,
        symbol: h.token.symbol,
        side: "BUY",
        sellAmount: sell,
        buyAmount: "0",
        usd: Number(sell) / 1e6,
        implied: 0,
        quoteJson: {},
        skip: "dust"
      });
      continue;
    }
    if (h.token.isTradingHalt) {
      prepared.push({
        tokenId: h.tokenId,
        symbol: h.token.symbol,
        side: "BUY",
        sellAmount: sell,
        buyAmount: "0",
        usd: Number(sell) / 1e6,
        implied: 0,
        quoteJson: {},
        skip: "halt"
      });
      continue;
    }
    const priced = await priceForToken(h.tokenId, env, sell, h.token.contractAddress);
    if ("skip" in priced && priced.skip) {
      prepared.push({
        tokenId: h.tokenId,
        symbol: h.token.symbol,
        side: "BUY",
        sellAmount: sell,
        buyAmount: "0",
        usd: Number(sell) / 1e6,
        implied: 0,
        quoteJson: {},
        skip: priced.skip
      });
      continue;
    }
    prepared.push({
      tokenId: h.tokenId,
      symbol: h.token.symbol,
      side: "BUY",
      sellAmount: sell,
      buyAmount: priced.buyAmount!,
      usd: Number(sell) / 1e6,
      implied: priced.implied!,
      quoteJson: priced.quoteJson!
    });
  }
  const result = await writeFills({ pocketId: pocket.id, cashId: cash.id, orderId: order.id, fills: prepared });
  return { orderId: order.id, ...result, currency: "Paper USDG" };
}

export async function materializeTarget(opts: {
  takeId: string;
  fromTargetId?: string | null;
  weights: WeightTarget[];
  cashBps: number;
  sentence: string;
  changeSummary: string;
}) {
  const last = await prisma.takeRevision.count({ where: { takeId: opts.takeId } });
  const target = await prisma.portfolioTarget.create({
    data: {
      cashBps: opts.cashBps,
      holdings: {
        create: opts.weights.map((h) => ({
          tokenId: h.tokenId,
          weightBps: h.weightBps,
          rationale: h.rationale || "Agent rebalance"
        }))
      }
    }
  });
  const tokens = await prisma.stockToken.findMany({
    where: { id: { in: opts.weights.map((w) => w.tokenId) } }
  });
  const byId = new Map(tokens.map((t) => [t.id, t.symbol]));
  const canonical = {
    sentence: opts.sentence,
    holdings: opts.weights.map((h) => ({ symbol: byId.get(h.tokenId) ?? h.tokenId, weightBps: h.weightBps })),
    cashBps: opts.cashBps
  };
  const receipt = canonicalReceipt(canonical);
  const revision = await prisma.takeRevision.create({
    data: {
      takeId: opts.takeId,
      number: last + 1,
      sentence: opts.sentence,
      origin: "AGENT",
      targetId: target.id,
      changeSummary: opts.changeSummary,
      receipt: { create: { canonicalJson: canonical, sha256: `${receipt.sha256}:${Date.now()}` } }
    }
  });
  await prisma.take.update({
    where: { id: opts.takeId },
    data: { currentRevisionId: revision.id }
  });
  return { target, revision };
}

export async function executePaperRebalance(
  pocketId: string,
  env: PaperEnv,
  weights: WeightTarget[],
  opts?: { proposalId?: string; cashBps?: number; skipUsd?: number; changeSummary?: string }
) {
  const pocket = await prisma.pocket.findUnique({
    where: { id: pocketId },
    include: {
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
  if (!pocket || pocket.mode === "WATCH") return { error: "not_found" as const };
  if (pocket.mode === "LIVE") return { error: "live_use_signer" as const };
  const currentRev = pocket.take.revisions[0];
  const fromTargetId = currentRev?.targetId ?? null;
  const cashBps = opts?.cashBps ?? Math.max(0, 10_000 - weights.reduce((s, w) => s + w.weightBps, 0));
  const { target, revision } = await materializeTarget({
    takeId: pocket.takeId,
    fromTargetId,
    weights,
    cashBps,
    sentence: currentRev?.sentence ?? "View",
    changeSummary: opts?.changeSummary ?? "Agent rebalance"
  });

  const mark = await computePocketMark(pocket.id);
  const navUsd = mark?.navUsd ?? 0;
  const trades = planRebalanceTrades(
    navUsd,
    (mark?.legs ?? []).map((l) => ({ tokenId: l.tokenId, usd: l.mtm ?? 0 })),
    weights,
    opts?.skipUsd ?? 5
  );
  const cash = await prisma.ledgerAccount.upsert({
    where: { pocketId_kind_tokenId: { pocketId: pocket.id, kind: "CASH", tokenId: "USDG" } },
    update: {},
    create: { pocketId: pocket.id, kind: "CASH", tokenId: "USDG" }
  });
  const order = await prisma.order.create({
    data: { pocketId: pocket.id, mode: "DRY_RUN", kind: "REBALANCE", status: "SUBMITTING" }
  });
  const tokenRows = await prisma.stockToken.findMany({
    where: { id: { in: [...new Set(trades.map((t) => t.tokenId))] } }
  });
  const tokenById = new Map(tokenRows.map((t) => [t.id, t]));
  const prepared: PreparedFill[] = [];
  for (const trade of trades) {
    const token = tokenById.get(trade.tokenId);
    if (!token) continue;
    if (token.isTradingHalt) {
      prepared.push({
        tokenId: token.id,
        symbol: token.symbol,
        side: trade.side,
        sellAmount: 0n,
        buyAmount: "0",
        usd: trade.usd,
        implied: 0,
        quoteJson: {},
        skip: "halt"
      });
      continue;
    }
    const sellMicro = BigInt(Math.round(trade.usd * 1e6));
    const priced = await priceForToken(token.id, env, trade.side === "BUY" ? sellMicro : 0n, token.contractAddress);
    if ("skip" in priced && priced.skip) {
      prepared.push({
        tokenId: token.id,
        symbol: token.symbol,
        side: trade.side,
        sellAmount: sellMicro,
        buyAmount: "0",
        usd: trade.usd,
        implied: 0,
        quoteJson: {},
        skip: priced.skip
      });
      continue;
    }
    const implied = priced.implied ?? 0;
    if (trade.side === "SELL") {
      const have = mark?.legs.find((l) => l.tokenId === token.id);
      const haveUsd = have?.mtm ?? 0;
      const usd = Math.min(trade.usd, haveUsd);
      const units = paperSellAmount(usd, implied);
      const haveUnits = BigInt(Math.floor((have?.qty ?? 0) * 10 ** TOKEN_DECIMALS));
      const sellUnits = units > haveUnits && haveUnits > 0n ? haveUnits : units;
      prepared.push({
        tokenId: token.id,
        symbol: token.symbol,
        side: "SELL",
        sellAmount: sellMicro,
        buyAmount: sellUnits.toString(),
        usd,
        implied,
        quoteJson: priced.quoteJson ?? { mode: "paper_rh_ask", priceUsd: implied }
      });
    } else {
      prepared.push({
        tokenId: token.id,
        symbol: token.symbol,
        side: "BUY",
        sellAmount: sellMicro,
        buyAmount: priced.buyAmount ?? paperBuyAmount(sellMicro, implied),
        usd: trade.usd,
        implied,
        quoteJson: priced.quoteJson ?? { mode: "paper_rh_ask", priceUsd: implied }
      });
    }
  }
  const result = await writeFills({ pocketId: pocket.id, cashId: cash.id, orderId: order.id, fills: prepared });
  if (opts?.proposalId) {
    await prisma.rebalanceProposal.update({
      where: { id: opts.proposalId },
      data: {
        status: result.status === "FAILED" ? "BLOCKED" : "AUTO_EXECUTED",
        fromTargetId,
        toTargetId: target.id,
        orderId: order.id
      }
    });
  }
  return {
    orderId: order.id,
    targetId: target.id,
    revisionId: revision.id,
    ...result,
    currency: "Paper USDG"
  };
}

export function weightsFromTrimAdd(
  holdings: Array<{ tokenId: string; weightBps: number; token: { symbol: string } }>,
  cashBps: number,
  intent: "trim" | "add_name",
  symbol: string,
  addTokenId?: string
): { weights: WeightTarget[]; cashBps: number } {
  const needle = symbol.replace(/^RH/i, "").toUpperCase();
  const next = holdings.map((h) => ({
    tokenId: h.tokenId,
    weightBps: h.weightBps,
    rationale: "Keep"
  }));
  let cash = cashBps;
  if (intent === "trim") {
    const hit = holdings.find((h) => h.token.symbol.replace(/^RH/i, "").toUpperCase() === needle);
    if (!hit) return { weights: next, cashBps: cash };
    const cut = Math.max(100, Math.round(hit.weightBps * 0.2));
    const row = next.find((n) => n.tokenId === hit.tokenId)!;
    row.weightBps = Math.max(0, row.weightBps - cut);
    row.rationale = `Trim ${needle}`;
    if (row.weightBps === 0) {
      const idx = next.findIndex((n) => n.tokenId === hit.tokenId);
      if (idx >= 0) next.splice(idx, 1);
    }
    cash += cut;
  } else if (addTokenId) {
    const add = Math.min(1200, Math.max(500, cash));
    cash = Math.max(0, cash - add);
    const existing = next.find((n) => n.tokenId === addTokenId);
    if (existing) {
      existing.weightBps += add;
      existing.rationale = `Add ${needle}`;
    } else {
      next.push({ tokenId: addTokenId, weightBps: add, rationale: `Add ${needle}` });
    }
  }
  const sum = next.reduce((s, n) => s + n.weightBps, 0) + cash;
  if (sum !== 10_000 && next[0]) next[0].weightBps += 10_000 - sum;
  return { weights: next, cashBps: cash };
}
