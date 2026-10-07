import { loadEnv } from "@takeandstake/config";
import { prisma } from "@takeandstake/db";
import {
  privyAuthorizationSignature,
  privyWalletRpcUrl,
  assertNotRawAuthorizationKey
} from "@takeandstake/chain";
import {
  breakerOpenProviders,
  buildUsdcWithdrawTx,
  getBalanceLamports,
  getTransaction,
  inspectBuiltTx,
  isSolanaPubkey,
  memePassesGates,
  providerAlerts,
  pushAlert,
  quoteAndBuild,
  signatureStatus,
  tokenBalanceDelta
} from "@takeandstake/markets";
import {
  LIVE_DAILY_CAP_USD_MEMES,
  LIVE_MAX_TRADE_USD_MEMES,
  SOLANA_CAIP2,
  SOLANA_CHAIN_ID,
  SOL_RESERVE,
  cashTokenId,
  log,
  logError
} from "@takeandstake/shared";

const env = loadEnv();
const LAMPORTS_RESERVE = Math.round(SOL_RESERVE * 1e9);

async function privySignAndSendSolana(privyWalletId: string, transaction: string): Promise<string | null> {
  const url = privyWalletRpcUrl(privyWalletId);
  const body = {
    method: "signAndSendTransaction",
    caip2: SOLANA_CAIP2,
    params: { transaction, encoding: "base64" }
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
  if (!res.ok) {
    logError("worker", "privy solana", new Error(`${res.status}: ${await res.text()}`));
    return null;
  }
  const json = (await res.json()) as { data?: { hash?: string; signature?: string }; result?: string };
  return json.data?.hash ?? json.data?.signature ?? json.result ?? null;
}

async function waitConfirmed(sig: string) {
  for (let i = 0; i < 16; i++) {
    const st = await signatureStatus(sig);
    if (st?.confirmed) return st;
    await new Promise((r) => setTimeout(r, 1500));
  }
  return signatureStatus(sig);
}

async function reconcileSubmitted() {
  const legs = await prisma.orderLeg.findMany({
    where: { status: "SUBMITTED" },
    include: { txs: true },
    take: 20
  });
  for (const leg of legs) {
    const sig = leg.txs[0]?.txHash;
    if (!sig) continue;
    const st = await signatureStatus(sig);
    if (st?.confirmed && !st.err) {
      await prisma.orderLeg.update({ where: { id: leg.id }, data: { status: "FILLED" } });
    } else if (st?.err) {
      await prisma.orderLeg.update({ where: { id: leg.id }, data: { status: "FAILED", skipReason: "tx_err" } });
    }
  }
}

export async function handleExecutionJob(data: {
  pocketId: string;
  userId: string;
  amountUsd?: number;
  idempotencyKey?: string;
  kind?: "INVEST" | "WITHDRAW";
  to?: string;
  orderId?: string;
}) {
  await reconcileSubmitted();
  if (data.kind === "WITHDRAW") return handleSolanaWithdraw(data);
  const pocket = await prisma.pocket.findUnique({
    where: { id: data.pocketId },
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
  if (!pocket || pocket.userId !== data.userId) return { error: "not_found" };
  if (pocket.take.chainId === 4663) {
    const { runLiveInvest } = await import("../../api/src/services/live-invest.js");
    return runLiveInvest(data.pocketId, env, data.userId, data.amountUsd);
  }
  const flag = await prisma.featureFlag.findUnique({
    where: { key: pocket.take.world === "MEMES" ? "live_trading_memes" : "live_trading_xstocks" }
  });
  if (!flag?.enabled) return { error: "live_disabled" };
  const wallet = await prisma.wallet.findFirst({
    where: { userId: data.userId, chainId: SOLANA_CHAIN_ID },
    include: { signerGrants: { where: { revokedAt: null }, take: 1 } }
  });
  if (!wallet?.privyWalletId) return { error: "no_solana_wallet" };
  const grant = wallet.signerGrants[0];
  if (!grant) return { error: "no_grant" };
  const target = pocket.take.revisions[0]?.target;
  if (!target) return { error: "no_target" };

  const lamports = await getBalanceLamports(wallet.address);
  if (lamports == null || lamports < LAMPORTS_RESERVE) {
    return { error: "top_up_sol", reserveSol: SOL_RESERVE };
  }

  const capTrade = pocket.take.world === "MEMES" ? LIVE_MAX_TRADE_USD_MEMES : env.LIVE_MAX_TRADE_USD;
  const capDay = pocket.take.world === "MEMES" ? LIVE_DAILY_CAP_USD_MEMES : env.LIVE_DAILY_CAP_USD;
  const spend = Math.min(data.amountUsd ?? capTrade, capDay);
  const idempotencyKey = data.idempotencyKey ?? `live:${pocket.id}:${Math.round(spend * 100)}`;
  const existing = data.orderId
    ? await prisma.order.findUnique({ where: { id: data.orderId } })
    : await prisma.order.findUnique({ where: { idempotencyKey } });
  if (existing && existing.status !== "SUBMITTING" && existing.status !== "PARTIAL") {
    return { orderId: existing.id, status: existing.status, idempotent: true };
  }
  const order =
    existing ??
    (await prisma.order.create({
      data: {
        pocketId: pocket.id,
        mode: "LIVE",
        kind: "INVEST",
        status: "SUBMITTING",
        idempotencyKey
      }
    }));
  const cashId = cashTokenId(pocket.take.world, pocket.take.chainId);
  const cash = await prisma.ledgerAccount.upsert({
    where: { pocketId_kind_tokenId: { pocketId: pocket.id, kind: "CASH", tokenId: cashId } },
    update: {},
    create: { pocketId: pocket.id, kind: "CASH", tokenId: cashId }
  });

  let filled = 0;
  let skipped = 0;
  for (const h of target.holdings) {
    const usd = (spend * h.weightBps) / 10_000;
    const skip = async (reason: string) => {
      skipped += 1;
      await prisma.orderLeg.create({
        data: { orderId: order.id, side: "BUY", tokenId: h.tokenId, sellAmount: String(Math.round(usd * 1e6)), status: "SKIPPED", skipReason: reason }
      });
    };
    if (usd > capTrade) {
      await skip("cap");
      continue;
    }
    if ((h.token.riskFlags as { noExit?: boolean } | null)?.noExit) {
      await skip("no_exit");
      continue;
    }
    if (pocket.take.world === "MEMES") {
      const gate = memePassesGates({
        liquidityUsd: Number(h.token.liquidityUsd ?? 0),
        launchedAt: h.token.launchedAt,
        risk: (h.token.riskFlags ?? {}) as {
          mintAuthorityDisabled?: boolean;
          freezeAuthorityDisabled?: boolean;
          topHolders?: number;
          devBalance?: number;
          isSus?: boolean;
        }
      });
      if (!gate.ok) {
        await skip(gate.reasons[0] ?? "risk");
        continue;
      }
    }
    if (h.token.source === "XSTOCKS" && h.token.xstocksSymbol) {
      const { xstockMultiplier } = await import("@takeandstake/markets");
      const mult = await xstockMultiplier(h.token.xstocksSymbol);
      if (mult) {
        await prisma.stockToken.update({
          where: { id: h.token.id },
          data: { currentMultiplier: mult }
        });
      }
    }
    const asset = {
      id: h.token.id,
      symbol: h.token.symbol,
      chainId: h.token.chainId,
      contractAddress: h.token.contractAddress,
      decimals: h.token.decimals,
      source: h.token.source,
      venue: h.token.venue,
      world: pocket.take.world,
      xstocksSymbol: h.token.xstocksSymbol
    };
    const built = await quoteAndBuild(asset, usd, wallet.address);
    if ("skip" in built) {
      await skip(built.skip);
      continue;
    }
    const fresh = await prisma.stockToken.findUnique({ where: { id: h.tokenId }, select: { venue: true, isTradingHalt: true } });
    if (fresh?.venue && fresh.venue !== h.token.venue) {
      await skip("venue_changed");
      continue;
    }
    if (fresh?.isTradingHalt) {
      await skip("halt");
      continue;
    }
    const leg = await prisma.orderLeg.create({
      data: {
        orderId: order.id,
        side: "BUY",
        tokenId: h.tokenId,
        sellAmount: String(Math.round(usd * 1e6)),
        status: "SUBMITTED",
        attempts: 0,
        quotes: { create: { quoteJson: built.quote.raw as object, buyAmount: built.quote.outAmount, price: usd, expiresAt: new Date(Date.now() + 30_000) } }
      }
    });
    let sig: string | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      await prisma.orderLeg.update({ where: { id: leg.id }, data: { attempts: attempt } });
      const rebuilt = attempt === 1 ? built : await quoteAndBuild(asset, usd, wallet.address);
      if ("skip" in rebuilt) continue;
      sig = await privySignAndSendSolana(wallet.privyWalletId, rebuilt.tx);
      if (sig) break;
    }
    if (!sig) {
      await prisma.orderLeg.update({ where: { id: leg.id }, data: { status: "FAILED", skipReason: "send" } });
      skipped += 1;
      pushAlert("exec_fail", `send ${h.token.symbol}`);
      continue;
    }
    await prisma.chainTx.create({ data: { legId: leg.id, txHash: sig, status: "SUBMITTED" } });
    const st = await waitConfirmed(sig);
    const parsed = await getTransaction(sig);
    if (parsed?.meta?.err || !st?.confirmed) {
      await prisma.orderLeg.update({ where: { id: leg.id }, data: { status: "FAILED", skipReason: "tx_err" } });
      skipped += 1;
      pushAlert("exec_fail", `tx ${sig}`);
      continue;
    }
    const rawIn = tokenBalanceDelta(parsed?.meta, wallet.address, h.token.contractAddress);
    const tokenAmount = rawIn > 0n ? rawIn.toString() : built.quote.outAmount;
    const pos = await prisma.ledgerAccount.upsert({
      where: { pocketId_kind_tokenId: { pocketId: pocket.id, kind: "POSITION", tokenId: h.tokenId } },
      update: {},
      create: { pocketId: pocket.id, kind: "POSITION", tokenId: h.tokenId }
    });
    await prisma.$transaction(async (txb) => {
      const ledgerTx = await txb.ledgerTransaction.create({
        data: { pocketId: pocket.id, type: "FILL", orderLegId: leg.id, txHash: sig }
      });
      await txb.ledgerEntry.createMany({
        data: [
          { transactionId: ledgerTx.id, accountId: cash.id, amount: String(-Math.round(usd * 1e6)), usdValue: -usd },
          { transactionId: ledgerTx.id, accountId: pos.id, amount: tokenAmount, usdValue: usd }
        ]
      });
      await txb.orderLeg.update({ where: { id: leg.id }, data: { status: "FILLED" } });
    });
    filled += 1;
  }
  const status = filled === 0 ? "FAILED" : skipped > 0 ? "PARTIAL" : "FILLED";
  await prisma.order.update({ where: { id: order.id }, data: { status } });
  log("worker", "solana live", { order: order.id, filled, skipped, reserveSol: SOL_RESERVE });
  return { orderId: order.id, filled, skipped, status };
}

async function handleSolanaWithdraw(data: {
  pocketId: string;
  userId: string;
  amountUsd?: number;
  idempotencyKey?: string;
  to?: string;
  orderId?: string;
}) {
  const wallet = await prisma.wallet.findFirst({
    where: { userId: data.userId, chainId: SOLANA_CHAIN_ID }
  });
  if (!wallet?.privyWalletId) return { error: "no_solana_wallet" };
  const dest = String(data.to ?? "");
  if (!isSolanaPubkey(dest)) return { error: "bad_solana_address" };
  const lamports = await getBalanceLamports(wallet.address);
  if (lamports == null || lamports < LAMPORTS_RESERVE) return { error: "top_up_sol", reserveSol: SOL_RESERVE };
  const amountRaw = BigInt(Math.round((data.amountUsd ?? 0) * 1e6));
  if (amountRaw <= 0n) return { error: "bad_amount" };
  const built = await buildUsdcWithdrawTx({ owner: wallet.address, dest, amountRaw });
  if (!built) return { error: "no_tx" };
  const inspected = inspectBuiltTx(built.tx, [wallet.address, dest, built.destAta, built.sourceAta]);
  if (!inspected.ok) return { error: inspected.reason ?? "inspect" };
  const existing = data.orderId
    ? await prisma.order.findUnique({ where: { id: data.orderId } })
    : data.idempotencyKey
      ? await prisma.order.findUnique({ where: { idempotencyKey: data.idempotencyKey } })
      : null;
  if (existing && existing.status !== "SUBMITTING") return { orderId: existing.id, status: existing.status, idempotent: true };
  let sig: string | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    const again = attempt === 1 ? built : await buildUsdcWithdrawTx({ owner: wallet.address, dest, amountRaw });
    if (!again) continue;
    sig = await privySignAndSendSolana(wallet.privyWalletId, again.tx);
    if (sig) break;
  }
  if (!sig) return { error: "send" };
  const order =
    existing ??
    (await prisma.order.create({
      data: {
        pocketId: data.pocketId,
        mode: "LIVE",
        kind: "EXIT",
        status: "FILLED",
        idempotencyKey: data.idempotencyKey
      }
    }));
  if (existing) await prisma.order.update({ where: { id: existing.id }, data: { status: "FILLED" } });
  return { orderId: order.id, tx: sig, destAta: built.destAta };
}

export async function reportProviderHealth() {
  const { open, recent } = providerAlerts();
  if (open.length) {
    logError("worker", "provider open", new Error(open.join(",")));
    pushAlert("breaker_open", open.join(","));
  }
  if (recent.some((a) => a.kind === "http_429")) logError("worker", "provider 429", new Error("rate limited"));
  return open;
}
