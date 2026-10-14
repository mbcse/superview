import type { Env } from "@takeandstake/config";
import { prisma } from "@takeandstake/db";
import { latestPrice, quoteEvmDesk, quoteWithinOracle } from "@takeandstake/core";
import {
  createEvmClient,
  encodeFunctionData,
  erc20Abi,
  formatUnits,
  hashIdempotency,
  receiptFillStatus,
  recoverTransactionAddress,
  type Address
} from "@takeandstake/chain";
import {
  attachSolanaSignature,
  getBalanceLamports,
  getTransaction,
  memePassesGates,
  quoteAndBuild,
  sendTransaction,
  signatureStatus,
  solanaMessageToSign,
  tokenBalanceDelta
} from "@takeandstake/markets";
import {
  LIVE_DAILY_CAP_USD_MEMES,
  LIVE_MAX_TRADE_USD_MEMES,
  MONAD_CHAIN_ID,
  SOLANA_CHAIN_ID,
  SOL_RESERVE,
  cashTokenIdForChain,
  chainOf,
  executorFor,
  isEvmChain
} from "@takeandstake/shared";
import { assertLiveAllowed, groupHoldingsByChain } from "@takeandstake/core";
import { fillFromTransferLogs } from "./live-invest.js";

const LAMPORTS_RESERVE = Math.round(SOL_RESERVE * 1e9);

export type MeraIntent = {
  kind: "evm" | "solana";
  purpose: "approve" | "swap";
  legId: string;
  chainId: number;
  to?: string;
  data?: string;
  value?: string;
  nonce?: number;
  gas?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  gasPrice?: string;
  type?: "eip1559" | "legacy";
  message?: string;
};

export type SignedMeraIntent = {
  legId: string;
  purpose: "approve" | "swap";
  signedTx?: string;
  signature?: string;
};

function isHexAddress(addr: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

export async function userUsesMeraSigner(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: { wallets: true }
  });
  if (!user) return false;
  return user.authProvider === "MERA" || user.wallets.some((w) => w.provider === "MERA" && !w.privyWalletId);
}

export async function readCashBalance(chainId: number, owner: string) {
  const def = chainOf(chainId);
  const client = createEvmClient(chainId);
  const raw = await client.readContract({
    address: def.cash.address as Address,
    abi: erc20Abi,
    functionName: "balanceOf",
    args: [owner as Address]
  });
  return { raw, usd: Number(formatUnits(raw, def.cash.decimals)) };
}

async function waitEvmReceipt(chainId: number, hash: `0x${string}`, timeoutMs = 90_000) {
  const client = createEvmClient(chainId);
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const rec = await client.getTransactionReceipt({ hash }).catch(() => null);
    if (rec) return rec;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return null;
}

async function waitSolanaConfirmed(sig: string) {
  for (let i = 0; i < 16; i++) {
    const st = await signatureStatus(sig);
    if (st?.confirmed) return st;
    await new Promise((r) => setTimeout(r, 1_500));
  }
  return signatureStatus(sig);
}

async function evmUnsigned(chainId: number, from: Address, tx: { to: string; data: string; value?: string; gas?: string }, nonce: number) {
  const client = createEvmClient(chainId);
  const fees = await client.estimateFeesPerGas().catch(() => null);
  const gasPrice = await client.getGasPrice().catch(() => null);
  const gas = tx.gas ? BigInt(tx.gas) : 250_000n;
  const value = tx.value ?? "0x0";
  if (fees?.maxFeePerGas) {
    return {
      kind: "evm" as const,
      to: tx.to,
      data: tx.data,
      value,
      nonce,
      gas: `0x${gas.toString(16)}`,
      maxFeePerGas: `0x${fees.maxFeePerGas.toString(16)}`,
      maxPriorityFeePerGas: `0x${(fees.maxPriorityFeePerGas ?? 0n).toString(16)}`,
      type: "eip1559" as const,
      chainId,
      from
    };
  }
  if (!gasPrice) throw new Error("no_fee_data");
  return {
    kind: "evm" as const,
    to: tx.to,
    data: tx.data,
    value,
    nonce,
    gas: `0x${gas.toString(16)}`,
    gasPrice: `0x${gasPrice.toString(16)}`,
    type: "legacy" as const,
    chainId,
    from
  };
}

async function applyFill(opts: {
  pocketId: string;
  legId: string;
  tokenId: string;
  cashId: string;
  sell: bigint;
  usd: number;
  buyAmount: string;
  txHash: string;
}) {
  const cash = await prisma.ledgerAccount.upsert({
    where: { pocketId_kind_tokenId: { pocketId: opts.pocketId, kind: "CASH", tokenId: opts.cashId } },
    update: {},
    create: { pocketId: opts.pocketId, kind: "CASH", tokenId: opts.cashId }
  });
  const pos = await prisma.ledgerAccount.upsert({
    where: { pocketId_kind_tokenId: { pocketId: opts.pocketId, kind: "POSITION", tokenId: opts.tokenId } },
    update: {},
    create: { pocketId: opts.pocketId, kind: "POSITION", tokenId: opts.tokenId }
  });
  await prisma.$transaction(async (tx) => {
    const ledgerTx = await tx.ledgerTransaction.create({
      data: { pocketId: opts.pocketId, type: "FILL", orderLegId: opts.legId, txHash: opts.txHash }
    });
    await tx.ledgerEntry.createMany({
      data: [
        { transactionId: ledgerTx.id, accountId: cash.id, amount: (-opts.sell).toString(), usdValue: -opts.usd },
        { transactionId: ledgerTx.id, accountId: pos.id, amount: opts.buyAmount, usdValue: opts.usd }
      ]
    });
    await tx.orderLeg.update({ where: { id: opts.legId }, data: { status: "FILLED" } });
  });
}

export async function prepareMeraLiveOrder(
  pocketId: string,
  env: Env,
  userId: string,
  amountUsd?: number,
  idempotencyKey?: string
) {
  const pause = await prisma.featureFlag.findUnique({ where: { key: "pause_trading" } });
  if (pause?.enabled) return { error: "paused" as const };
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
  if (pocket.user.jurisdictionStatus !== "ALLOWED") return { error: "restricted_jurisdiction" as const };
  const target = pocket.take.revisions[0]?.target;
  if (!target) return { error: "no_target" as const };
  const groups = groupHoldingsByChain(target.holdings);
  const key = idempotencyKey ?? hashIdempotency(["mera-live", pocket.id, String(Math.round((amountUsd ?? 0) * 100)), target.id]);
  const existing = await prisma.order.findUnique({ where: { idempotencyKey: key }, include: { legs: { include: { quotes: true } } } });
  if (existing && existing.status !== "AWAITING_SIGNATURE") {
    return { orderId: existing.id, status: existing.status, idempotent: true };
  }
  if (existing?.status === "AWAITING_SIGNATURE") {
    const intents = existing.legs.flatMap((leg) => {
      const q = leg.quotes[leg.quotes.length - 1]?.quoteJson as { intents?: MeraIntent[]; message?: string } | null;
      if (q?.intents?.length) return q.intents;
      if (q?.message) return [{ kind: "solana" as const, purpose: "swap" as const, legId: leg.id, chainId: leg.chainId ?? SOLANA_CHAIN_ID, message: q.message }];
      return [];
    });
    if (intents.length) {
      return { needsClientSign: true as const, orderId: existing.id, status: "AWAITING_SIGNATURE" as const, intents, skipped: 0, legs: [] };
    }
  }
  const order =
    existing ??
    (await prisma.order.create({
      data: { pocketId: pocket.id, mode: "LIVE", kind: "INVEST", status: "AWAITING_SIGNATURE", idempotencyKey: key }
    }));

  const intents: MeraIntent[] = [];
  const legsOut: Array<{ symbol: string; status: string; skip?: string }> = [];
  let skipped = 0;

  for (const [chainId, holdings] of groups) {
    try {
      executorFor(chainId);
    } catch {
      skipped += holdings.length;
      for (const h of holdings) legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "venue_not_live" });
      continue;
    }
    const allowed = await assertLiveAllowed({ chainId, world: pocket.take.world, user: pocket.user, env });
    if (!allowed.ok) {
      skipped += holdings.length;
      for (const h of holdings) legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: allowed.error });
      continue;
    }
    const wallet = pocket.user.wallets.find((w) => w.chainId === chainId && w.provider === "MERA");
    if (!wallet) {
      skipped += holdings.length;
      for (const h of holdings) legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "no_mera_wallet" });
      continue;
    }
    const capTrade = pocket.take.world === "MEMES" ? LIVE_MAX_TRADE_USD_MEMES : env.LIVE_MAX_TRADE_USD;
    const capDay = pocket.take.world === "MEMES" ? LIVE_DAILY_CAP_USD_MEMES : env.LIVE_DAILY_CAP_USD;
    if (chainId === SOLANA_CHAIN_ID) {
      const lamports = await getBalanceLamports(wallet.address);
      if (lamports == null || lamports < LAMPORTS_RESERVE) {
        skipped += holdings.length;
        for (const h of holdings) legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "top_up_sol" });
        continue;
      }
      const spend = Math.min(amountUsd ?? capTrade, capDay);
      for (const h of holdings) {
        const usd = (spend * h.weightBps) / 10_000;
        if (usd > capTrade || h.token.isTradingHalt) {
          skipped += 1;
          legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: h.token.isTradingHalt ? "halt" : "cap" });
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
            skipped += 1;
            legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: gate.reasons[0] ?? "risk" });
            continue;
          }
        }
        const built = await quoteAndBuild(
          {
            id: h.token.id,
            symbol: h.token.symbol,
            chainId: h.token.chainId,
            contractAddress: h.token.contractAddress,
            decimals: h.token.decimals,
            source: h.token.source,
            venue: h.token.venue,
            world: pocket.take.world,
            xstocksSymbol: h.token.xstocksSymbol
          },
          usd,
          wallet.address
        );
        if ("skip" in built) {
          skipped += 1;
          legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: built.skip });
          continue;
        }
        const leg = await prisma.orderLeg.create({
          data: {
            orderId: order.id,
            side: "BUY",
            tokenId: h.tokenId,
            chainId,
            walletId: wallet.id,
            sellAmount: String(Math.round(usd * 1e6)),
            status: "AWAITING_SIGNATURE"
          }
        });
        const message = solanaMessageToSign(built.tx);
        await prisma.quote.create({
          data: {
            legId: leg.id,
            provider: built.route,
            quoteJson: { quote: built.quote as object, unsignedTx: built.tx, message },
            buyAmount: built.quote.outAmount,
            price: usd,
            expiresAt: new Date(Date.now() + 30_000)
          }
        });
        intents.push({ kind: "solana", purpose: "swap", legId: leg.id, chainId, message });
        legsOut.push({ symbol: h.token.symbol, status: "AWAITING_SIGNATURE" });
      }
      continue;
    }

    if (!isEvmChain(chainId) || (chainId !== MONAD_CHAIN_ID && !env.ZEROX_API_KEY)) {
      skipped += holdings.length;
      for (const h of holdings) legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "no_quote" });
      continue;
    }
    const onchain = await readCashBalance(chainId, wallet.address).catch(() => null);
    if (!onchain || !(onchain.usd > 1)) {
      skipped += holdings.length;
      for (const h of holdings) legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: "no_cash" });
      continue;
    }
    const spendUsd = Math.min(amountUsd ?? onchain.usd, onchain.usd, capDay);
    const budgetMicro = BigInt(Math.round(spendUsd * 1e6));
    const cashToken = chainOf(chainId).cash;
    const client = createEvmClient(chainId);
    let nonce = await client.getTransactionCount({ address: wallet.address as Address, blockTag: "pending" });
    for (const h of holdings) {
      const sell = (budgetMicro * BigInt(h.weightBps)) / 10_000n;
      const usd = Number(sell) / 1e6;
      if (h.token.isTradingHalt || usd > capTrade || !isHexAddress(h.token.contractAddress)) {
        skipped += 1;
        legsOut.push({
          symbol: h.token.symbol,
          status: "SKIPPED",
          skip: h.token.isTradingHalt ? "halt" : usd > capTrade ? "cap" : "no_quote"
        });
        continue;
      }
      const quote = await quoteEvmDesk({
        chainId,
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
      const implied = quote?.implied ?? 0;
      const snap = await latestPrice(h.tokenId);
      const oracle = snap ? Number(snap.price) : implied;
      if (!quote?.transaction || !quoteWithinOracle(implied, oracle, env.ORACLE_MAX_DEVIATION)) {
        skipped += 1;
        legsOut.push({ symbol: h.token.symbol, status: "SKIPPED", skip: quote?.transaction ? "oracle_offside" : "no_tx" });
        continue;
      }
      const leg = await prisma.orderLeg.create({
        data: {
          orderId: order.id,
          side: "BUY",
          tokenId: h.tokenId,
          chainId,
          walletId: wallet.id,
          sellAmount: sell.toString(),
          status: "AWAITING_SIGNATURE"
        }
      });
      const builtIntents: MeraIntent[] = [];
      const spender = quote.spender;
      if (spender) {
        const data = encodeFunctionData({
          abi: erc20Abi,
          functionName: "approve",
          args: [spender as Address, sell]
        });
        const approve = await evmUnsigned(chainId, wallet.address as Address, { to: cashToken.address, data }, nonce);
        nonce += 1;
        builtIntents.push({ ...approve, purpose: "approve", legId: leg.id });
      }
      const swap = await evmUnsigned(chainId, wallet.address as Address, quote.transaction, nonce);
      nonce += 1;
      builtIntents.push({ ...swap, purpose: "swap", legId: leg.id });
      await prisma.quote.create({
        data: {
          legId: leg.id,
          provider: quote.route,
          quoteJson: { quote: quote.raw as object, intents: builtIntents },
          buyAmount: quote.buyAmount,
          price: implied,
          expiresAt: new Date(Date.now() + 30_000)
        }
      });
      intents.push(...builtIntents);
      legsOut.push({ symbol: h.token.symbol, status: "AWAITING_SIGNATURE" });
    }
  }

  if (!intents.length) {
    await prisma.order.update({ where: { id: order.id }, data: { status: "FAILED" } });
    return { error: "no_live_intents" as const, orderId: order.id, skipped, legs: legsOut };
  }
  return {
    needsClientSign: true as const,
    orderId: order.id,
    status: "AWAITING_SIGNATURE" as const,
    intents,
    skipped,
    legs: legsOut
  };
}

export async function confirmMeraLiveOrder(orderId: string, env: Env, userId: string, signed: SignedMeraIntent[]) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      pocket: { include: { user: { include: { wallets: true } }, take: true } },
      legs: { include: { quotes: true, txs: true } }
    }
  });
  if (!order || order.pocket.userId !== userId) return { error: "not_found" as const };
  if (order.status !== "AWAITING_SIGNATURE") return { error: "not_awaiting_signature" as const };
  const byLeg = new Map(signed.map((s) => [`${s.legId}:${s.purpose}`, s]));
  let filled = 0;
  let skipped = 0;
  const legsOut: Array<{ symbol: string; status: string; skip?: string; tx?: string }> = [];

  for (const leg of order.legs) {
    const token = await prisma.stockToken.findUnique({ where: { id: leg.tokenId } });
    const quote = leg.quotes[leg.quotes.length - 1];
    if (!token || !quote) {
      skipped += 1;
      continue;
    }
    if (quote.expiresAt < new Date()) {
      skipped += 1;
      await prisma.orderLeg.update({ where: { id: leg.id }, data: { status: "FAILED", skipReason: "quote_expired" } });
      legsOut.push({ symbol: token.symbol, status: "FAILED", skip: "quote_expired" });
      continue;
    }
    const wallet = order.pocket.user.wallets.find((w) => w.id === leg.walletId);
    if (!wallet) {
      skipped += 1;
      continue;
    }
    const json = quote.quoteJson as {
      unsignedTx?: string;
      quote?: { outAmount?: string };
      intents?: MeraIntent[];
      buyAmount?: string;
    };
    try {
      if (leg.chainId === SOLANA_CHAIN_ID) {
        const sigIn = byLeg.get(`${leg.id}:swap`);
        if (!sigIn?.signature || !json.unsignedTx) throw new Error("missing_signature");
        const signedTx = attachSolanaSignature(json.unsignedTx, sigIn.signature, wallet.address);
        const txHash = await sendTransaction(signedTx);
        if (!txHash) throw new Error("send_failed");
        await prisma.orderLeg.update({ where: { id: leg.id }, data: { status: "SUBMITTED" } });
        await prisma.chainTx.create({
          data: { legId: leg.id, txHash, status: "SUBMITTED", chainId: SOLANA_CHAIN_ID, signer: "MERA" }
        });
        const st = await waitSolanaConfirmed(txHash);
        const parsed = await getTransaction(txHash);
        if (parsed?.meta?.err || !st?.confirmed) throw new Error("tx_err");
        const rawIn = tokenBalanceDelta(parsed?.meta, wallet.address, token.contractAddress);
        const buyAmount = rawIn > 0n ? rawIn.toString() : String(json.quote?.outAmount ?? quote.buyAmount);
        await applyFill({
          pocketId: order.pocketId,
          legId: leg.id,
          tokenId: token.id,
          cashId: cashTokenIdForChain(SOLANA_CHAIN_ID),
          sell: BigInt(leg.sellAmount.toString()),
          usd: Number(leg.sellAmount) / 1e6,
          buyAmount,
          txHash
        });
        filled += 1;
        legsOut.push({ symbol: token.symbol, status: "FILLED", tx: txHash });
        continue;
      }

      const chainId = leg.chainId;
      if (chainId == null) throw new Error("no_chain");
      const client = createEvmClient(chainId);
      const intents = json.intents ?? [];
      let lastHash: `0x${string}` | null = null;
      let rec: Awaited<ReturnType<typeof waitEvmReceipt>> = null;
      for (const intent of intents) {
        const row = byLeg.get(`${leg.id}:${intent.purpose}`);
        if (!row?.signedTx) throw new Error("missing_signed_tx");
        const signedTx = row.signedTx as `0x${string}`;
        const recovered = await recoverTransactionAddress({ serializedTransaction: signedTx as never });
        if (recovered.toLowerCase() !== wallet.address.toLowerCase()) throw new Error("signer_mismatch");
        const hash = await client.sendRawTransaction({ serializedTransaction: signedTx });
        lastHash = hash;
        rec = await waitEvmReceipt(chainId, hash);
        if (!rec || receiptFillStatus(rec) !== "FILLED") throw new Error("no_receipt");
        await prisma.chainTx.create({
          data: {
            legId: leg.id,
            txHash: hash,
            status: "CONFIRMED",
            chainId,
            signer: "MERA",
            blockNumber: rec.blockNumber
          }
        });
      }
      if (!lastHash || !rec) throw new Error("no_receipt");
      const buyAmount =
        fillFromTransferLogs(
          (rec.logs ?? []) as Array<{ address?: string; topics?: string[]; data?: string }>,
          token.contractAddress,
          wallet.address
        ) ?? String(quote.buyAmount);
      await applyFill({
        pocketId: order.pocketId,
        legId: leg.id,
        tokenId: token.id,
        cashId: cashTokenIdForChain(chainId),
        sell: BigInt(leg.sellAmount.toString()),
        usd: Number(leg.sellAmount) / 1e6,
        buyAmount,
        txHash: lastHash
      });
      filled += 1;
      legsOut.push({ symbol: token.symbol, status: "FILLED", tx: lastHash });
    } catch (e) {
      skipped += 1;
      await prisma.orderLeg.update({
        where: { id: leg.id },
        data: { status: "FAILED", skipReason: e instanceof Error ? e.message.slice(0, 120) : "sign_failed" }
      });
      legsOut.push({ symbol: token.symbol, status: "FAILED", skip: e instanceof Error ? e.message : "sign_failed" });
    }
  }

  const status = filled === 0 ? "FAILED" : skipped > 0 ? "PARTIAL" : "FILLED";
  await prisma.order.update({ where: { id: order.id }, data: { status } });
  void env;
  return { orderId: order.id, status, fills: filled, skipped, legs: legsOut };
}
