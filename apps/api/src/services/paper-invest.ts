import type { Env } from "@takeandstake/config";
import { prisma } from "@takeandstake/db";
import { latestPrice, quoteWithinOracle } from "@takeandstake/core";
import { fetchZeroXQuote, quoteUsdPerToken, ROBINHOOD_CHAIN_ID, USDG_MAINNET } from "@takeandstake/chain";

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

export async function depositPaperUsd(pocketId: string, usd: number) {
  const cash = await prisma.ledgerAccount.upsert({
    where: { pocketId_kind_tokenId: { pocketId, kind: "CASH", tokenId: "USDG" } },
    update: {},
    create: { pocketId, kind: "CASH", tokenId: "USDG" }
  });
  const amount = String(Math.round(usd * 1_000_000));
  const tx = await prisma.ledgerTransaction.create({
    data: { pocketId, type: "DEPOSIT" }
  });
  await prisma.ledgerEntry.create({
    data: { transactionId: tx.id, accountId: cash.id, amount, usdValue: usd }
  });
  const backing = await prisma.backing.findFirst({ where: { pocketId } });
  if (backing) {
    await prisma.backing.update({
      where: { id: backing.id },
      data: { amountUsd: Number(backing.amountUsd ?? 0) + usd }
    });
  }
  return { cashId: cash.id, usd };
}

export async function runDryRunInvest(pocketId: string, env: Env) {
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
  const legsOut: Array<{ symbol: string; status: string; skip?: string }> = [];
  let filled = 0;
  let skipped = 0;
  const maxDev = env.ORACLE_MAX_DEVIATION ?? 0.015;

  for (const h of target.holdings) {
    const sell = (cashUnits * BigInt(h.weightBps)) / 10_000n;
    if (sell < 5_000_000n) {
      skipped += 1;
      legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "dust" });
      continue;
    }
    if (h.token.isTradingHalt) {
      skipped += 1;
      legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "halt" });
      continue;
    }
    const snap = await latestPrice(h.tokenId);
    const rhAsk = snap ? Number(snap.ask ?? snap.price) : null;
    const chainlink = await prisma.priceSnapshot.findFirst({
      where: { tokenId: h.tokenId, source: "CHAINLINK" },
      orderBy: { observedAt: "desc" }
    });
    const oracle = chainlink ? Number(chainlink.price) : rhAsk;
    if (rhAsk == null && oracle == null) {
      skipped += 1;
      legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "no_price" });
      continue;
    }

    let buyAmount: string;
    let quoteJson: object;
    let implied = rhAsk ?? oracle ?? 0;

    if (env.ZEROX_API_KEY && isHexAddress(h.token.contractAddress)) {
      try {
        const quote = await fetchZeroXQuote({
          apiKey: env.ZEROX_API_KEY,
          chainId: ROBINHOOD_CHAIN_ID,
          sellToken: USDG_MAINNET,
          buyToken: h.token.contractAddress,
          sellAmount: sell.toString(),
          firm: false
        });
        implied = quoteUsdPerToken(quote, 6, 18);
        if (oracle != null && !quoteWithinOracle(implied, oracle, maxDev)) {
          skipped += 1;
          legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "oracle_offside" });
          continue;
        }
        buyAmount = quote.buyAmount;
        quoteJson = quote as object;
      } catch {
        implied = rhAsk ?? oracle ?? 0;
        buyAmount = paperBuyAmount(sell, implied);
        quoteJson = { mode: "paper_rh_ask", priceUsd: implied };
      }
    } else {
      implied = rhAsk ?? oracle ?? 0;
      buyAmount = paperBuyAmount(sell, implied);
      quoteJson = { mode: "paper_rh_ask", priceUsd: implied };
    }

    const usd = Number(sell) / 1e6;
    const pos = await prisma.ledgerAccount.upsert({
      where: { pocketId_kind_tokenId: { pocketId: pocket.id, kind: "POSITION", tokenId: h.tokenId } },
      update: {},
      create: { pocketId: pocket.id, kind: "POSITION", tokenId: h.tokenId }
    });
    const tx = await prisma.ledgerTransaction.create({ data: { pocketId: pocket.id, type: "FILL" } });
    await prisma.ledgerEntry.createMany({
      data: [
        { transactionId: tx.id, accountId: cash.id, amount: (-sell).toString(), usdValue: -usd },
        { transactionId: tx.id, accountId: pos.id, amount: buyAmount, usdValue: usd }
      ]
    });
    await prisma.orderLeg.create({
      data: {
        orderId: order.id,
        side: "BUY",
        tokenId: h.tokenId,
        sellAmount: sell.toString(),
        status: "FILLED",
        quotes: {
          create: {
            quoteJson,
            buyAmount,
            price: implied,
            expiresAt: new Date(Date.now() + 30_000)
          }
        }
      }
    });
    filled += 1;
    legsOut.push({ symbol: h.token.symbol, status: "FILLED" });
  }

  const status = filled === 0 ? "FAILED" : skipped > 0 ? "PARTIAL" : "FILLED";
  await prisma.order.update({ where: { id: order.id }, data: { status } });
  return { orderId: order.id, status, fills: filled, skipped, legs: legsOut, currency: "Paper USDG" };
}
