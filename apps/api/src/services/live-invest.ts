import type { Env } from "@takeandstake/config";
import { prisma } from "@takeandstake/db";
import { latestPrice, quoteWithinOracle } from "@takeandstake/core";
import { fetchZeroXQuote, quoteUsdPerToken, ROBINHOOD_CHAIN_ID, USDG_MAINNET } from "@takeandstake/chain";

function isHexAddress(addr: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

export async function runLiveInvest(pocketId: string, env: Env, userId: string) {
  const pause = await prisma.featureFlag.findUnique({ where: { key: "pause_trading" } });
  const live = await prisma.featureFlag.findUnique({ where: { key: "live_trading" } });
  if (pause?.enabled) return { error: "paused" as const };
  if (!live?.enabled || env.APP_MODE !== "live") return { error: "live_disabled" as const };
  if (!env.PRIVY_AUTHORIZATION_KEY) return { error: "no_signer" as const };

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
      },
      user: { include: { wallets: true } }
    }
  });
  if (!pocket || pocket.userId !== userId || pocket.mode !== "LIVE") return { error: "not_found" as const };
  const wallet = pocket.user.wallets.find((w) => w.isPrimary) ?? pocket.user.wallets[0];
  if (!wallet) return { error: "no_wallet" as const };
  const grant = await prisma.signerGrant.findFirst({ where: { walletId: wallet.id, revokedAt: null } });
  if (!grant) return { error: "no_grant" as const };

  const target = pocket.take.revisions[0]?.target;
  if (!target) return { error: "no_target" as const };
  const cash = await prisma.ledgerAccount.findFirst({ where: { pocketId: pocket.id, kind: "CASH" } });
  if (!cash) return { error: "no_cash" as const };
  const entries = await prisma.ledgerEntry.findMany({ where: { accountId: cash.id } });
  const cashUnits = entries.reduce((s, e) => s + BigInt(e.amount.toFixed(0)), 0n);

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const priorLegs = await prisma.orderLeg.findMany({
    where: {
      order: { pocketId: pocket.id, mode: "LIVE", createdAt: { gte: todayStart }, status: { in: ["FILLED", "PARTIAL"] } }
    }
  });
  let spentToday = priorLegs.reduce((s, l) => s + Number(l.sellAmount) / 1e6, 0);

  const order = await prisma.order.create({
    data: { pocketId: pocket.id, mode: "LIVE", kind: "INVEST", status: "SUBMITTING" }
  });
  const legsOut: Array<{ symbol: string; status: string; skip?: string; tx?: string }> = [];
  let filled = 0;
  let skipped = 0;

  for (const h of target.holdings) {
    const sell = (cashUnits * BigInt(h.weightBps)) / 10_000n;
    const usd = Number(sell) / 1e6;
    if (h.token.isTradingHalt) {
      skipped += 1;
      legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "halt" });
      continue;
    }
    if (usd > env.LIVE_MAX_TRADE_USD) {
      skipped += 1;
      legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "cap" });
      continue;
    }
    if (spentToday + usd > env.LIVE_DAILY_CAP_USD) {
      skipped += 1;
      legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "daily_cap" });
      continue;
    }
    if (!env.ZEROX_API_KEY || !isHexAddress(h.token.contractAddress)) {
      skipped += 1;
      legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "no_quote" });
      continue;
    }
    try {
      const quote = await fetchZeroXQuote({
        apiKey: env.ZEROX_API_KEY,
        chainId: ROBINHOOD_CHAIN_ID,
        sellToken: USDG_MAINNET,
        buyToken: h.token.contractAddress,
        sellAmount: sell.toString(),
        taker: wallet.address,
        firm: true
      });
      const implied = quoteUsdPerToken(quote, 6, 18);
      const snap = await latestPrice(h.tokenId);
      const oracle = snap ? Number(snap.price) : implied;
      if (!quoteWithinOracle(implied, oracle, env.ORACLE_MAX_DEVIATION)) {
        skipped += 1;
        legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "oracle_offside" });
        continue;
      }
      const txHash = await signAndBroadcast(env, wallet.address, quote);
      const leg = await prisma.orderLeg.create({
        data: {
          orderId: order.id,
          side: "BUY",
          tokenId: h.tokenId,
          sellAmount: sell.toString(),
          status: "FILLED"
        }
      });
      await prisma.chainTx.create({
        data: {
          legId: leg.id,
          txHash,
          status: "SUBMITTED"
        }
      });
      spentToday += usd;
      const pos = await prisma.ledgerAccount.upsert({
        where: { pocketId_kind_tokenId: { pocketId: pocket.id, kind: "POSITION", tokenId: h.tokenId } },
        update: {},
        create: { pocketId: pocket.id, kind: "POSITION", tokenId: h.tokenId }
      });
      const tx = await prisma.ledgerTransaction.create({ data: { pocketId: pocket.id, type: "FILL" } });
      await prisma.ledgerEntry.createMany({
        data: [
          { transactionId: tx.id, accountId: cash.id, amount: (-sell).toString(), usdValue: -usd },
          { transactionId: tx.id, accountId: pos.id, amount: quote.buyAmount, usdValue: usd }
        ]
      });
      filled += 1;
      legsOut.push({ symbol: h.token.symbol, status: "FILLED", tx: txHash });
    } catch (e) {
      skipped += 1;
      legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: e instanceof Error ? e.message : "swap_failed" });
    }
  }
  const status = filled === 0 ? "FAILED" : skipped > 0 ? "PARTIAL" : "FILLED";
  await prisma.order.update({ where: { id: order.id }, data: { status } });
  return { orderId: order.id, status, fills: filled, skipped, legs: legsOut };
}

async function signAndBroadcast(env: Env, from: string, quote: { transaction?: { to: string; data: string; value: string } }) {
  const tx = quote.transaction;
  if (!tx) throw new Error("no_tx");
  const res = await fetch("https://api.privy.io/v1/wallets/rpc", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${Buffer.from(`${env.PRIVY_APP_ID}:${env.PRIVY_APP_SECRET}`).toString("base64")}`,
      "privy-app-id": env.PRIVY_APP_ID,
      "privy-authorization-signature": env.PRIVY_AUTHORIZATION_KEY
    },
    body: JSON.stringify({
      method: "eth_sendTransaction",
      params: {
        from,
        to: tx.to,
        data: tx.data,
        value: tx.value ?? "0x0",
        chain_id: 4663
      }
    })
  });
  if (!res.ok) throw new Error(`privy_sign ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { result?: string; hash?: string };
  return json.result ?? json.hash ?? "0xpending";
}
