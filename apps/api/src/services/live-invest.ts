import type { Env } from "@takeandstake/config";
import { prisma } from "@takeandstake/db";
import { latestPrice, quoteWithinOracle } from "@takeandstake/core";
import {
  createRhClient,
  erc20Abi,
  fetchZeroXQuote,
  hashIdempotency,
  privyAuthorizationSignature,
  privyWalletRpcUrl,
  quoteUsdPerToken,
  ROBINHOOD_CHAIN_ID,
  USDG_MAINNET,
  assertNotRawAuthorizationKey,
  receiptFillStatus,
  encodeFunctionData,
  formatUnits,
  type Address
} from "@takeandstake/chain";
import { LIVE_DAILY_CAP_USD_MEMES, LIVE_MAX_TRADE_USD_MEMES } from "@takeandstake/shared";
import { memePassesGates } from "@takeandstake/markets";
import { grantAllows } from "../wallet-bind.js";

function isHexAddress(addr: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

export function fillFromTransferLogs(
  logs: Array<{ address?: string; topics?: string[]; data?: string }>,
  token: string,
  wallet: string
): string | null {
  const toTopic = `0x${wallet.slice(2).toLowerCase().padStart(64, "0")}`;
  const hit = logs.find(
    (l) =>
      (l.address ?? "").toLowerCase() === token.toLowerCase() &&
      (l.topics?.[0] ?? "").toLowerCase() === TRANSFER_TOPIC &&
      (l.topics?.[2] ?? "").toLowerCase() === toTopic
  );
  if (!hit?.data) return null;
  try {
    return BigInt(hit.data).toString();
  } catch {
    return null;
  }
}

async function usdgBalance(_rpcUrl: string | undefined, owner: Address) {
  const client = createRhClient(_rpcUrl);
  const raw = await client.readContract({
    address: USDG_MAINNET,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner]
  });
  return { raw, usd: Number(formatUnits(raw, 6)) };
}

async function waitReceipt(rpcUrl: string | undefined, hash: `0x${string}`, timeoutMs = 90_000) {
  const client = createRhClient(rpcUrl);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rec = await client.getTransactionReceipt({ hash }).catch(() => null);
    if (rec) return rec;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return null;
}

async function privySend(env: Env, privyWalletId: string, from: Address, tx: { to: string; data: string; value?: string }) {
  const url = privyWalletRpcUrl(privyWalletId);
  const body = {
    method: "eth_sendTransaction",
    params: {
      from,
      to: tx.to,
      data: tx.data,
      value: tx.value ?? "0x0",
      chain_id: ROBINHOOD_CHAIN_ID
    }
  };
  const signature = privyAuthorizationSignature({
    method: "POST",
    url,
    body,
    privyAppId: env.PRIVY_APP_ID,
    authorizationKey: env.PRIVY_AUTHORIZATION_KEY
  });
  assertNotRawAuthorizationKey(signature, env.PRIVY_AUTHORIZATION_KEY);
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Basic ${Buffer.from(`${env.PRIVY_APP_ID}:${env.PRIVY_APP_SECRET}`).toString("base64")}`,
      "privy-app-id": env.PRIVY_APP_ID,
      "privy-authorization-signature": signature
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`privy_sign ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { result?: string; hash?: string; data?: { hash?: string } };
  const hash = json.result ?? json.hash ?? json.data?.hash;
  if (!hash || hash === env.PRIVY_AUTHORIZATION_KEY) throw new Error("privy_no_hash");
  return hash as `0x${string}`;
}

export function fillStatusFromReceipt(rec: { status?: string } | null) {
  return receiptFillStatus(rec);
}

export async function readUsdgBalance(env: Env, address: string) {
  return usdgBalance(env.ALCHEMY_RPC_URL || env.ROBINHOOD_RPC_URL, address as Address);
}

export async function runLiveInvest(pocketId: string, env: Env, userId: string, amountUsd?: number) {
  const pause = await prisma.featureFlag.findUnique({ where: { key: "pause_trading" } });
  if (pause?.enabled) return { error: "paused" as const };
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
      user: { include: { wallets: { include: { signerGrants: true } } } }
    }
  });
  if (!pocket || pocket.userId !== userId || pocket.mode !== "LIVE") return { error: "not_found" as const };
  if (pocket.user.jurisdictionStatus !== "ALLOWED") return { error: "restricted_jurisdiction" as const };
  const rhMeme = pocket.take.world === "MEMES";
  const flag = await prisma.featureFlag.findUnique({
    where: { key: rhMeme ? "live_rh_bags" : "live_trading" }
  });
  if (!flag?.enabled || env.APP_MODE !== "live") return { error: "live_disabled" as const };
  if (rhMeme && !pocket.user.memesRiskAckAt) return { error: "memes_ack_required" as const };
  const capTrade = rhMeme ? LIVE_MAX_TRADE_USD_MEMES : env.LIVE_MAX_TRADE_USD;
  const capDay = rhMeme ? LIVE_DAILY_CAP_USD_MEMES : env.LIVE_DAILY_CAP_USD;
  const wallet = pocket.user.wallets.find((w) => w.chainId === 4663 && w.isPrimary) ?? pocket.user.wallets.find((w) => w.chainId === 4663) ?? pocket.user.wallets[0];
  if (!wallet?.privyWalletId) return { error: "no_wallet" as const };
  const grant = wallet.signerGrants.find((g) => !g.revokedAt && g.expiresAt > new Date());
  if (!grant) return { error: "no_grant" as const };
  if (grant.privySignerId !== wallet.privyWalletId) return { error: "grant_mismatch" as const };

  const target = pocket.take.revisions[0]?.target;
  if (!target) return { error: "no_target" as const };
  const rpc = env.ALCHEMY_RPC_URL || env.ROBINHOOD_RPC_URL;
  const onchain = await usdgBalance(rpc, wallet.address as Address);
  const spendUsd = Math.min(amountUsd ?? onchain.usd, onchain.usd, capDay);
  if (!(spendUsd > 1)) return { error: "no_usdg" as const };

  const idempotencyKey = hashIdempotency(["live", pocket.id, String(Math.round(spendUsd * 100)), target.id]);
  const existing = await prisma.order.findUnique({ where: { idempotencyKey } });
  if (existing) return { orderId: existing.id, status: existing.status, fills: 0, skipped: 0, legs: [], idempotent: true };

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const priorLegs = await prisma.orderLeg.findMany({
    where: {
      order: { pocketId: pocket.id, mode: "LIVE", createdAt: { gte: todayStart }, status: { in: ["FILLED", "PARTIAL", "SUBMITTING"] } }
    }
  });
  let spentToday = priorLegs.reduce((s, l) => s + Number(l.sellAmount) / 1e6, 0);
  const order = await prisma.order.create({
    data: { pocketId: pocket.id, mode: "LIVE", kind: "INVEST", status: "SUBMITTING", idempotencyKey }
  });
  const cash = await prisma.ledgerAccount.upsert({
    where: { pocketId_kind_tokenId: { pocketId: pocket.id, kind: "CASH", tokenId: "USDG" } },
    update: {},
    create: { pocketId: pocket.id, kind: "CASH", tokenId: "USDG" }
  });

  const legsOut: Array<{ symbol: string; status: string; skip?: string; tx?: string }> = [];
  let filled = 0;
  let skipped = 0;
  const budgetMicro = BigInt(Math.round(spendUsd * 1e6));

  for (const h of target.holdings) {
    const sell = (budgetMicro * BigInt(h.weightBps)) / 10_000n;
    const usd = Number(sell) / 1e6;
    if (h.token.isTradingHalt) {
      skipped += 1;
      legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "halt" });
      continue;
    }
    if (usd > capTrade || usd > Number(grant.maxPerTxUsd)) {
      skipped += 1;
      legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "cap" });
      continue;
    }
    if (spentToday + usd > capDay) {
      skipped += 1;
      legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "daily_cap" });
      continue;
    }
    if (rhMeme) {
      if ((h.token.riskFlags as { noExit?: boolean } | null)?.noExit) {
        skipped += 1;
        legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "no_exit" });
        continue;
      }
      const gate = memePassesGates({
        liquidityUsd: Number(h.token.liquidityUsd ?? 0),
        launchedAt: h.token.launchedAt,
        risk: (h.token.riskFlags ?? {}) as {
          mintAuthorityDisabled?: boolean;
          freezeAuthorityDisabled?: boolean;
          topHolders?: number;
          devBalance?: number;
          isSus?: boolean;
          token2022Risk?: string[];
        }
      });
      if (!gate.ok) {
        skipped += 1;
        legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: gate.reasons[0] ?? "risk" });
        continue;
      }
    }
    if (!env.ZEROX_API_KEY || !isHexAddress(h.token.contractAddress)) {
      skipped += 1;
      legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "no_quote" });
      continue;
    }
    const leg = await prisma.orderLeg.create({
      data: {
        orderId: order.id,
        side: "BUY",
        tokenId: h.tokenId,
        sellAmount: sell.toString(),
        status: "QUOTED"
      }
    });
    try {
      let quote = await fetchZeroXQuote({
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
        await prisma.orderLeg.update({ where: { id: leg.id }, data: { status: "SKIPPED", skipReason: "oracle_offside" } });
        legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "oracle_offside" });
        continue;
      }
      const spender = quote.issues?.allowance?.spender;
      if (spender) {
        if (!grantAllows(grant.allowedContracts, spender)) {
          skipped += 1;
          await prisma.orderLeg.update({ where: { id: leg.id }, data: { status: "SKIPPED", skipReason: "spender_not_allowed" } });
          legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "spender_not_allowed" });
          continue;
        }
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spender as Address, sell]
        });
        const approveHash = await privySend(env, wallet.privyWalletId, wallet.address as Address, { to: USDG_MAINNET, data });
        const rec = await waitReceipt(rpc, approveHash);
        if (!rec || rec.status !== "success") throw new Error("approve_failed");
        quote = await fetchZeroXQuote({
          apiKey: env.ZEROX_API_KEY,
          chainId: ROBINHOOD_CHAIN_ID,
          sellToken: USDG_MAINNET,
          buyToken: h.token.contractAddress,
          sellAmount: sell.toString(),
          taker: wallet.address,
          firm: true
        });
      }
      if (!quote.transaction) throw new Error("no_tx");
      if (!grantAllows(grant.allowedContracts, quote.transaction.to)) {
        skipped += 1;
        await prisma.orderLeg.update({ where: { id: leg.id }, data: { status: "SKIPPED", skipReason: "router_not_allowed" } });
        legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "router_not_allowed" });
        continue;
      }
      await prisma.quote.create({
        data: {
          legId: leg.id,
          quoteJson: quote as object,
          buyAmount: quote.buyAmount,
          price: implied,
          expiresAt: new Date(Date.now() + 30_000)
        }
      });
      const txHash = await privySend(env, wallet.privyWalletId, wallet.address as Address, quote.transaction);
      await prisma.orderLeg.update({ where: { id: leg.id }, data: { status: "SUBMITTED" } });
      const chainTx = await prisma.chainTx.create({
        data: { legId: leg.id, txHash, status: "SUBMITTED" }
      });
      const rec = await waitReceipt(rpc, txHash);
      if (!rec || fillStatusFromReceipt(rec) !== "FILLED") {
        await prisma.chainTx.update({ where: { id: chainTx.id }, data: { status: "FAILED", error: "revert_or_timeout" } });
        await prisma.orderLeg.update({ where: { id: leg.id }, data: { status: "FAILED", skipReason: "no_receipt" } });
        skipped += 1;
        legsOut.push({ symbol: h.token.symbol, status: "FAILED", skip: "no_receipt", tx: txHash });
        continue;
      }
      await prisma.chainTx.update({
        where: { id: chainTx.id },
        data: { status: "CONFIRMED", blockNumber: rec.blockNumber }
      });
      const pos = await prisma.ledgerAccount.upsert({
        where: { pocketId_kind_tokenId: { pocketId: pocket.id, kind: "POSITION", tokenId: h.tokenId } },
        update: {},
        create: { pocketId: pocket.id, kind: "POSITION", tokenId: h.tokenId }
      });
      await prisma.$transaction(async (tx) => {
        const ledgerTx = await tx.ledgerTransaction.create({
          data: { pocketId: pocket.id, type: "FILL", orderLegId: leg.id, txHash }
        });
        await tx.ledgerEntry.createMany({
          data: [
            { transactionId: ledgerTx.id, accountId: cash.id, amount: (-sell).toString(), usdValue: -usd },
            {
              transactionId: ledgerTx.id,
              accountId: pos.id,
              amount:
                fillFromTransferLogs(
                  (rec.logs ?? []) as Array<{ address?: string; topics?: string[]; data?: string }>,
                  h.token.contractAddress,
                  wallet.address
                ) ?? quote.buyAmount,
              usdValue: usd
            }
          ]
        });
        await tx.orderLeg.update({ where: { id: leg.id }, data: { status: "FILLED" } });
      });
      spentToday += usd;
      filled += 1;
      legsOut.push({ symbol: h.token.symbol, status: "FILLED", tx: txHash });
    } catch (e) {
      skipped += 1;
      await prisma.orderLeg.update({
        where: { id: leg.id },
        data: { status: "FAILED", skipReason: e instanceof Error ? e.message.slice(0, 120) : "swap_failed" }
      });
      legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: e instanceof Error ? e.message : "swap_failed" });
    }
  }
  const status = filled === 0 ? "FAILED" : skipped > 0 ? "PARTIAL" : "FILLED";
  await prisma.order.update({ where: { id: order.id }, data: { status } });
  return { orderId: order.id, status, fills: filled, skipped, legs: legsOut };
}
