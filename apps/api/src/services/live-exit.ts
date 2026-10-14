import type { Env } from "@takeandstake/config";
import { prisma } from "@takeandstake/db";
import { latestPrice, quoteEvmDesk, unitsToQty } from "@takeandstake/core";
import {
  assertNotRawAuthorizationKey,
  createEvmClient,
  encodeFunctionData,
  erc20Abi,
  hashIdempotency,
  privyAuthorizationSignature,
  privyWalletRpcUrl,
  type Address
} from "@takeandstake/chain";
import { BASE_CHAIN_ID, MONAD_CHAIN_ID, cashTokenIdForChain, chainOf, isEvmChain } from "@takeandstake/shared";
import { jupiterSwapQuote, jupiterSwapTx } from "@takeandstake/markets";
import { grantAllows } from "../wallet-bind.js";
import { fillFromTransferLogs, fillStatusFromReceipt } from "./live-invest.js";
import { bridgeDeskToHome } from "./privy-transfer.js";

async function privySendEvm(
  env: Env,
  privyWalletId: string,
  from: Address,
  tx: { to: string; data: string; value?: string },
  chainId: number
) {
  const url = privyWalletRpcUrl(privyWalletId);
  const body = {
    method: "eth_sendTransaction",
    params: { from, to: tx.to, data: tx.data, value: tx.value ?? "0x0", chain_id: chainId }
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
  if (!res.ok) throw new Error(`privy_sign ${res.status}`);
  const json = (await res.json()) as { result?: string; hash?: string; data?: { hash?: string } };
  const hash = json.result ?? json.hash ?? json.data?.hash;
  if (!hash) throw new Error("privy_no_hash");
  return hash as `0x${string}`;
}

async function waitReceipt(chainId: number, hash: `0x${string}`) {
  const client = createEvmClient(chainId);
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    const rec = await client.getTransactionReceipt({ hash }).catch(() => null);
    if (rec) return rec;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  return null;
}

export async function runLiveSell(
  pocketId: string,
  env: Env,
  userId: string,
  opts: { tokenId?: string; amountUsd?: number; all?: boolean }
) {
  const pocket = await prisma.pocket.findUnique({
    where: { id: pocketId },
    include: {
      user: { include: { wallets: { include: { signerGrants: true } } } },
      accounts: { include: { entries: true } }
    }
  });
  if (!pocket || pocket.userId !== userId || pocket.mode !== "LIVE") return { error: "not_found" as const };
  const positions = pocket.accounts.filter((a) => a.kind === "POSITION" && a.tokenId);
  const wanted = opts.all ? positions : positions.filter((a) => a.tokenId === opts.tokenId);
  if (!wanted.length) return { error: "no_position" as const };

  const idempotencyKey = hashIdempotency([
    "sell",
    pocket.id,
    opts.tokenId ?? "all",
    String(Math.round((opts.amountUsd ?? 0) * 100))
  ]);
  const existing = await prisma.order.findUnique({ where: { idempotencyKey } });
  if (existing) return { orderId: existing.id, status: existing.status, fills: 0, skipped: 0, idempotent: true };

  const order = await prisma.order.create({
    data: { pocketId: pocket.id, mode: "LIVE", kind: "EXIT", status: "SUBMITTING", idempotencyKey }
  });
  let filled = 0;
  let skipped = 0;
  const legs: Array<{ symbol: string; status: string; tx?: string }> = [];

  for (const acc of wanted) {
    const token = await prisma.stockToken.findUnique({ where: { id: acc.tokenId! } });
    if (!token) {
      skipped += 1;
      continue;
    }
    const qty = acc.entries.reduce((s, e) => s + unitsToQty(e.amount, token.decimals), 0);
    if (qty <= 0) {
      skipped += 1;
      continue;
    }
    const last = Number((await latestPrice(token.id))?.price ?? 0);
    const posUsd = last > 0 ? qty * last : 0;
    const sellUsd = opts.amountUsd && !opts.all ? Math.min(opts.amountUsd, posUsd || opts.amountUsd) : posUsd;
    const sellQty = posUsd > 0 ? qty * (sellUsd / posUsd) : qty;
    const raw = BigInt(Math.max(1, Math.floor(sellQty * 10 ** token.decimals)));
    const wallet =
      pocket.user.wallets.find((w) => w.chainId === token.chainId && w.provider !== "MERA" && w.privyWalletId) ??
      pocket.user.wallets.find((w) => w.chainId === token.chainId);
    const cashId = cashTokenIdForChain(token.chainId);
    const cash = await prisma.ledgerAccount.upsert({
      where: { pocketId_kind_tokenId: { pocketId: pocket.id, kind: "CASH", tokenId: cashId } },
      update: {},
      create: { pocketId: pocket.id, kind: "CASH", tokenId: cashId }
    });
    const leg = await prisma.orderLeg.create({
      data: {
        orderId: order.id,
        side: "SELL",
        tokenId: token.id,
        chainId: token.chainId,
        walletId: wallet?.id,
        sellAmount: raw.toString(),
        status: "QUOTED"
      }
    });

    try {
      if (!wallet?.privyWalletId) throw new Error("no_wallet");
      let txHash: string | null = null;
      let usdOut = sellUsd;

      if (isEvmChain(token.chainId)) {
        if (token.chainId !== MONAD_CHAIN_ID && !env.ZEROX_API_KEY) throw new Error("no_quote");
        const cashTok = chainOf(token.chainId).cash;
        let quote = await quoteEvmDesk({
          chainId: token.chainId,
          side: "SELL",
          token: {
            id: token.id,
            symbol: token.symbol,
            contractAddress: token.contractAddress,
            decimals: token.decimals,
            venue: token.venue,
            source: token.source
          },
          sellAmount: raw.toString(),
          amountUsd: sellUsd || last * sellQty,
          owner: wallet.address,
          cashAddress: cashTok.address,
          zeroxKey: env.ZEROX_API_KEY
        });
        const grant = wallet.signerGrants.find((g) => !g.revokedAt && g.expiresAt > new Date());
        if (!grant) throw new Error("no_grant");
        const spender = quote?.spender;
        if (spender) {
          if (!grantAllows(grant.allowedContracts, spender)) throw new Error("spender_not_allowed");
          const data = encodeFunctionData({
            abi: erc20Abi,
            functionName: "approve",
            args: [spender as Address, raw]
          });
          const approveHash = await privySendEvm(env, wallet.privyWalletId, wallet.address as Address, { to: token.contractAddress, data }, token.chainId);
          const rec = await waitReceipt(token.chainId, approveHash);
          if (!rec || rec.status !== "success") throw new Error("approve_failed");
          quote = await quoteEvmDesk({
            chainId: token.chainId,
            side: "SELL",
            token: {
              id: token.id,
              symbol: token.symbol,
              contractAddress: token.contractAddress,
              decimals: token.decimals,
              venue: token.venue,
              source: token.source
            },
            sellAmount: raw.toString(),
            amountUsd: sellUsd || last * sellQty,
            owner: wallet.address,
            cashAddress: cashTok.address,
            zeroxKey: env.ZEROX_API_KEY
          });
        }
        if (!quote?.transaction) throw new Error("no_tx");
        txHash = await privySendEvm(env, wallet.privyWalletId, wallet.address as Address, quote.transaction, token.chainId);
        const rec = await waitReceipt(token.chainId, txHash as `0x${string}`);
        if (!rec || fillStatusFromReceipt(rec) !== "FILLED") throw new Error("no_receipt");
        const got = fillFromTransferLogs(
          (rec.logs ?? []) as Array<{ address?: string; topics?: string[]; data?: string }>,
          cashTok.address,
          wallet.address
        );
        usdOut = got ? Number(got) / 10 ** cashTok.decimals : Number(quote.buyAmount) / 10 ** cashTok.decimals;
      } else {
        const quote = await jupiterSwapQuote({
          asset: {
            id: token.id,
            symbol: token.symbol,
            chainId: token.chainId,
            contractAddress: token.contractAddress,
            decimals: token.decimals,
            source: token.source,
            venue: token.venue,
            xstocksSymbol: token.xstocksSymbol
          },
          side: "SELL",
          amountUsd: sellUsd || last * sellQty,
          owner: wallet.address
        });
        if (!quote) throw new Error("no_quote");
        const built = await jupiterSwapTx(quote, wallet.address);
        if (!built) throw new Error("no_tx");
        const { privyAuthorizationSignature, privyWalletRpcUrl, assertNotRawAuthorizationKey } = await import("@takeandstake/chain");
        const { SOLANA_CAIP2 } = await import("@takeandstake/shared");
        const url = privyWalletRpcUrl(wallet.privyWalletId);
        const body = { method: "signAndSendTransaction", caip2: SOLANA_CAIP2, params: { transaction: built, encoding: "base64" } };
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
        if (!res.ok) throw new Error("send");
        const json = (await res.json()) as { data?: { hash?: string }; result?: string };
        txHash = json.data?.hash ?? json.result ?? null;
        usdOut = Number(quote.outAmount) / 1e6;
      }

      if (!txHash) throw new Error("no_hash");
      await prisma.chainTx.create({ data: { legId: leg.id, txHash, status: "CONFIRMED", chainId: token.chainId, signer: "PRIVY" } });
      await prisma.$transaction(async (tx) => {
        const ledgerTx = await tx.ledgerTransaction.create({
          data: { pocketId: pocket.id, type: "FILL", orderLegId: leg.id, txHash }
        });
        await tx.ledgerEntry.createMany({
          data: [
            { transactionId: ledgerTx.id, accountId: acc.id, amount: (-raw).toString(), usdValue: -usdOut },
            { transactionId: ledgerTx.id, accountId: cash.id, amount: String(Math.round(usdOut * 1e6)), usdValue: usdOut }
          ]
        });
        await tx.orderLeg.update({ where: { id: leg.id }, data: { status: "FILLED" } });
      });
      if (token.chainId !== BASE_CHAIN_ID && usdOut > 0) {
        await bridgeDeskToHome({ env, userId, fromChainId: token.chainId, amountUsd: usdOut });
      }
      filled += 1;
      legs.push({ symbol: token.symbol, status: "FILLED", tx: txHash });
    } catch (e) {
      skipped += 1;
      const raw = e instanceof Error ? e.message : "sell_failed";
      const reason = /0x quote failed|no_quote|liquidity|no.?book/i.test(raw) ? "desk_closed" : raw.slice(0, 120);
      await prisma.orderLeg.update({
        where: { id: leg.id },
        data: { status: "FAILED", skipReason: reason }
      });
      legs.push({ symbol: token.symbol, status: "FAILED" });
    }
  }

  const status = filled === 0 ? "FAILED" : skipped > 0 ? "PARTIAL" : "FILLED";
  await prisma.order.update({ where: { id: order.id }, data: { status } });
  return { orderId: order.id, status, fills: filled, skipped, legs };
}

export async function runLiveWithdraw(pocketId: string, env: Env, userId: string, amountUsd: number) {
  const pocket = await prisma.pocket.findUnique({
    where: { id: pocketId },
    include: { accounts: { include: { entries: true } } }
  });
  if (!pocket || pocket.userId !== userId || pocket.mode !== "LIVE") return { error: "not_found" as const };
  if (!(amountUsd > 0)) return { error: "bad_amount" as const };
  const cashAccs = pocket.accounts.filter((a) => a.kind === "CASH");
  const cashUsd = cashAccs.reduce((s, a) => s + a.entries.reduce((t, e) => t + Number(e.usdValue), 0), 0);
  if (cashUsd < amountUsd - 1e-6) return { error: "insufficient_cash" as const };

  let left = amountUsd;
  const hashes: string[] = [];
  for (const acc of cashAccs) {
    if (left <= 0) break;
    const avail = acc.entries.reduce((t, e) => t + Number(e.usdValue), 0);
    if (avail <= 0) continue;
    const take = Math.min(avail, left);
    const token = acc.tokenId ? await prisma.stockToken.findUnique({ where: { id: acc.tokenId } }) : null;
    const chainId = token?.chainId ?? (acc.tokenId?.includes(":8453") ? 8453 : acc.tokenId?.includes(":101") ? 101 : acc.tokenId === "USDG" ? 4663 : BASE_CHAIN_ID);
    const moved = await bridgeDeskToHome({ env, userId, fromChainId: chainId, amountUsd: take });
    if (!moved.ok && chainId !== BASE_CHAIN_ID) return { error: moved.error };
    if (moved.ok && "hash" in moved && moved.hash) hashes.push(moved.hash);
    const idempotencyKey = hashIdempotency(["wd", pocket.id, acc.id, String(Math.round(take * 100))]);
    const order = await prisma.order.create({
      data: { pocketId: pocket.id, mode: "LIVE", kind: "EXIT", status: "FILLED", idempotencyKey }
    });
    await prisma.$transaction(async (tx) => {
      const ledgerTx = await tx.ledgerTransaction.create({
        data: { pocketId: pocket.id, type: "WITHDRAW", txHash: hashes[hashes.length - 1] }
      });
      await tx.ledgerEntry.create({
        data: { transactionId: ledgerTx.id, accountId: acc.id, amount: String(-Math.round(take * 1e6)), usdValue: -take }
      });
      void order;
    });
    left -= take;
  }
  return { usd: amountUsd - left, remainingUsd: cashUsd - amountUsd + left, hashes };
}
