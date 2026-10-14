import type { Env } from "@takeandstake/config";
import { prisma } from "@takeandstake/db";
import { isDustLeg, latestPrice, liveIdempotencyParts, liveSpendUsd, quoteEvmDesk, quoteWithinOracle } from "@takeandstake/core";
import {
  createEvmClient,
  createRhClient,
  erc20Abi,
  hashIdempotency,
  privyAuthorizationSignature,
  privyWalletRpcUrl,
  ROBINHOOD_CHAIN_ID,
  USDG_MAINNET,
  assertNotRawAuthorizationKey,
  receiptFillStatus,
  encodeFunctionData,
  formatUnits,
  type Address
} from "@takeandstake/chain";
import { LIVE_DAILY_CAP_USD_MEMES, LIVE_MAX_TRADE_USD_MEMES, MONAD_CHAIN_ID, cashTokenIdForChain, chainOf, executorFor } from "@takeandstake/shared";
import { assertLiveAllowed } from "@takeandstake/core";
import { memePassesGates } from "@takeandstake/markets";
import { grantAllows } from "../wallet-bind.js";
import { ensureDeskCash } from "./privy-transfer.js";

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

export async function evmCashBalance(chainId: number, owner: Address) {
  const cash = chainOf(chainId).cash;
  const client = createEvmClient(chainId);
  const raw = await client.readContract({
    address: cash.address as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner]
  });
  return { raw, usd: Number(formatUnits(raw, cash.decimals)) };
}

async function waitReceipt(chainId: number, hash: `0x${string}`, timeoutMs = 90_000) {
  const client = createEvmClient(chainId);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rec = await client.getTransactionReceipt({ hash }).catch(() => null);
    if (rec) return rec;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return null;
}

async function privySend(
  env: Env,
  privyWalletId: string,
  from: Address,
  tx: { to: string; data: string; value?: string },
  chainId = ROBINHOOD_CHAIN_ID
) {
  const url = privyWalletRpcUrl(privyWalletId);
  const body = {
    method: "eth_sendTransaction",
    params: {
      from,
      to: tx.to,
      data: tx.data,
      value: tx.value ?? "0x0",
      chain_id: chainId
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

export async function runLiveInvest(
  pocketId: string,
  env: Env,
  userId: string,
  amountUsd?: number,
  opts?: { chainId?: number; orderId?: string }
) {
  const pause = await prisma.featureFlag.findUnique({ where: { key: "pause_trading" } });
  if (pause?.enabled) return { error: "paused" as const };
  const targetHoldingsPreview = await prisma.pocket.findUnique({
    where: { id: pocketId },
    include: {
      take: { include: { revisions: { orderBy: { number: "desc" }, take: 1, include: { target: { include: { holdings: { include: { token: true } } } } } } } }
    }
  });
  const previewHoldings = targetHoldingsPreview?.take.revisions[0]?.target?.holdings ?? [];
  const evmChains = [...new Set(previewHoldings.map((h) => h.token.chainId).filter((id) => id !== 101))];
  const focusChain = opts?.chainId ?? evmChains[0] ?? 4663;
  try {
    executorFor(focusChain);
  } catch {
    return { error: "venue_not_live" as const };
  }

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
  const allowed = await assertLiveAllowed({
    chainId: focusChain,
    world: pocket.take.world,
    user: pocket.user,
    env
  });
  if (!allowed.ok) return { error: allowed.error as "live_disabled" };
  const capTrade = rhMeme ? LIVE_MAX_TRADE_USD_MEMES : env.LIVE_MAX_TRADE_USD;
  const capDay = rhMeme ? LIVE_DAILY_CAP_USD_MEMES : env.LIVE_DAILY_CAP_USD;
  const wallet =
    pocket.user.wallets.find((w) => w.chainId === focusChain && w.provider !== "MERA" && w.isPrimary) ??
    pocket.user.wallets.find((w) => w.chainId === focusChain && w.provider !== "MERA") ??
    pocket.user.wallets.find((w) => w.chainId === focusChain);
  if (wallet?.provider === "MERA") return { error: "mera_requires_client_sign" as const, chainId: focusChain };
  if (!env.PRIVY_AUTHORIZATION_KEY) return { error: "no_signer" as const };
  if (!wallet?.privyWalletId) return { error: "no_wallet" as const };
  const grant = wallet.signerGrants.find((g) => !g.revokedAt && g.expiresAt > new Date());
  if (!grant) return { error: "no_grant" as const };
  if (wallet.provider === "PRIVY" && grant.privySignerId && grant.privySignerId !== wallet.privyWalletId) {
    return { error: "grant_mismatch" as const };
  }

  const target = pocket.take.revisions[0]?.target;
  if (!target) return { error: "no_target" as const };
  const funded = await ensureDeskCash({ env, userId, destChainId: focusChain, needUsd: Math.min(amountUsd ?? capDay, capDay) });
  if (!funded.ok) return { error: funded.error };
  const onchain = await evmCashBalance(focusChain, wallet.address as Address);
  const spendUsd = liveSpendUsd(amountUsd, Math.max(onchain.usd, funded.have), capDay);
  if (spendUsd == null) return { error: "no_cash" as const };

  const idempotencyKey = hashIdempotency(liveIdempotencyParts(pocket.id, spendUsd, target.id, focusChain));
  const existing = opts?.orderId
    ? await prisma.order.findUnique({ where: { id: opts.orderId } })
    : await prisma.order.findUnique({ where: { idempotencyKey } });
  if (existing && existing.status !== "SUBMITTING" && existing.status !== "PARTIAL") {
    return { orderId: existing.id, status: existing.status, fills: 0, skipped: 0, legs: [], idempotent: true };
  }

  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const priorLegs = await prisma.orderLeg.findMany({
    where: {
      order: { pocketId: pocket.id, mode: "LIVE", createdAt: { gte: todayStart }, status: { in: ["FILLED", "PARTIAL", "SUBMITTING"] } }
    }
  });
  let spentToday = priorLegs.reduce((s, l) => s + Number(l.sellAmount) / 1e6, 0);
  const order =
    existing ??
    (await prisma.order.create({
      data: { pocketId: pocket.id, mode: "LIVE", kind: "INVEST", status: "SUBMITTING", idempotencyKey }
    }));
  if (funded.ok && funded.bridged && funded.hash && !("persisted" in funded && funded.persisted)) {
    await prisma.chainTx.create({
      data: {
        chainId: focusChain,
        signer: "PRIVY",
        txHash: funded.hash,
        status: "SUBMITTED",
        privyTransactionId: "actionId" in funded ? funded.actionId : undefined
      }
    });
  }
  const cashId = cashTokenIdForChain(focusChain);
  const cashToken = chainOf(focusChain).cash;
  const cash = await prisma.ledgerAccount.upsert({
    where: { pocketId_kind_tokenId: { pocketId: pocket.id, kind: "CASH", tokenId: cashId } },
    update: {},
    create: { pocketId: pocket.id, kind: "CASH", tokenId: cashId }
  });

  const legsOut: Array<{ symbol: string; status: string; skip?: string; tx?: string }> = [];
  let filled = 0;
  let skipped = 0;
  const budgetMicro = BigInt(Math.round(spendUsd * 1e6));

  const holdings = target.holdings.filter((h) => h.token.chainId === focusChain);
  if (!holdings.length) return { error: "venue_not_live" as const };
  const persistSkip = async (h: (typeof holdings)[number], sell: bigint, reason: string) => {
    skipped += 1;
    await prisma.orderLeg.create({
      data: {
        orderId: order.id,
        side: "BUY",
        tokenId: h.tokenId,
        chainId: focusChain,
        walletId: wallet.id,
        sellAmount: sell.toString(),
        status: "SKIPPED",
        skipReason: reason
      }
    });
    legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: reason });
  };
  for (const h of holdings) {
    const sell = (budgetMicro * BigInt(h.weightBps)) / 10_000n;
    const usd = Number(sell) / 1e6;
    if (isDustLeg(usd)) {
      await persistSkip(h, sell, "dust");
      continue;
    }
    if (h.token.isTradingHalt) {
      await persistSkip(h, sell, "halt");
      continue;
    }
    if (usd > capTrade || usd > Number(grant.maxPerTxUsd)) {
      await persistSkip(h, sell, "cap");
      continue;
    }
    if (spentToday + usd > capDay) {
      await persistSkip(h, sell, "daily_cap");
      continue;
    }
    if (rhMeme) {
      if ((h.token.riskFlags as { noExit?: boolean } | null)?.noExit) {
        await persistSkip(h, sell, "no_exit");
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
        await persistSkip(h, sell, gate.reasons[0] ?? "risk");
        continue;
      }
    }
    if (!isHexAddress(h.token.contractAddress) || (focusChain !== MONAD_CHAIN_ID && !env.ZEROX_API_KEY)) {
      await persistSkip(h, sell, "desk_closed");
      continue;
    }
    const leg = await prisma.orderLeg.create({
      data: {
        orderId: order.id,
        side: "BUY",
        tokenId: h.tokenId,
        chainId: focusChain,
        walletId: wallet.id,
        sellAmount: sell.toString(),
        status: "QUOTED"
      }
    });
    try {
      let quote = await quoteEvmDesk({
        chainId: focusChain,
        side: "BUY",
        token: {
          id: h.token.id,
          symbol: h.token.symbol,
          contractAddress: h.token.contractAddress,
          decimals: h.token.decimals,
          venue: h.token.venue,
          source: h.token.source
        },
        sellAmount: sell.toString(),
        amountUsd: usd,
        owner: wallet.address,
        cashAddress: cashToken.address,
        zeroxKey: env.ZEROX_API_KEY
      });
      if (!quote?.buyAmount || quote.buyAmount === "0") {
        skipped += 1;
        await prisma.orderLeg.update({ where: { id: leg.id }, data: { status: "SKIPPED", skipReason: "desk_closed" } });
        legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "desk_closed" });
        continue;
      }
      const implied = quote.implied;
      const snap = await latestPrice(h.tokenId);
      const oracle = snap ? Number(snap.price) : implied;
      if (!quoteWithinOracle(implied, oracle, env.ORACLE_MAX_DEVIATION)) {
        skipped += 1;
        await prisma.orderLeg.update({ where: { id: leg.id }, data: { status: "SKIPPED", skipReason: "oracle_offside" } });
        legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "oracle_offside" });
        continue;
      }
      const spender = quote.spender;
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
        const approveHash = await privySend(env, wallet.privyWalletId, wallet.address as Address, { to: cashToken.address, data }, focusChain);
        const rec = await waitReceipt(focusChain, approveHash);
        if (!rec || rec.status !== "success") throw new Error("approve_failed");
        quote = await quoteEvmDesk({
          chainId: focusChain,
          side: "BUY",
          token: {
            id: h.token.id,
            symbol: h.token.symbol,
            contractAddress: h.token.contractAddress,
            decimals: h.token.decimals,
            venue: h.token.venue,
            source: h.token.source
          },
          sellAmount: sell.toString(),
          amountUsd: usd,
          owner: wallet.address,
          cashAddress: cashToken.address,
          zeroxKey: env.ZEROX_API_KEY
        });
      }
      if (!quote?.transaction) throw new Error("no_tx");
      if (!grantAllows(grant.allowedContracts, quote.transaction.to)) {
        skipped += 1;
        await prisma.orderLeg.update({ where: { id: leg.id }, data: { status: "SKIPPED", skipReason: "router_not_allowed" } });
        legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "router_not_allowed" });
        continue;
      }
      await prisma.quote.create({
        data: {
          legId: leg.id,
          provider: quote.route,
          quoteJson: quote.raw as object,
          buyAmount: quote.buyAmount,
          price: implied,
          expiresAt: new Date(Date.now() + 30_000)
        }
      });
      const txHash = await privySend(env, wallet.privyWalletId, wallet.address as Address, quote.transaction, focusChain);
      await prisma.orderLeg.update({ where: { id: leg.id }, data: { status: "SUBMITTED" } });
      const chainTx = await prisma.chainTx.create({
        data: { legId: leg.id, txHash, status: "SUBMITTED", chainId: focusChain, signer: "PRIVY" }
      });
      const rec = await waitReceipt(focusChain, txHash);
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
      const raw = e instanceof Error ? e.message : "swap_failed";
      const reason = /0x quote failed|liquidity|no.?book/i.test(raw) ? "desk_closed" : raw.slice(0, 120);
      await prisma.orderLeg.update({
        where: { id: leg.id },
        data: { status: "FAILED", skipReason: reason }
      });
      legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: reason });
    }
  }
  const status = filled === 0 ? "FAILED" : skipped > 0 ? "PARTIAL" : "FILLED";
  await prisma.order.update({ where: { id: order.id }, data: { status } });
  return { orderId: order.id, status, fills: filled, skipped, legs: legsOut };
}
