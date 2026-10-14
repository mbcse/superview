import type { Env } from "@takeandstake/config";
import { prisma } from "@takeandstake/db";
import {
  AUSD_MONAD,
  USDC_BASE,
  assertNotRawAuthorizationKey,
  createEvmClient,
  encodeFunctionData,
  erc20Abi,
  fetchZeroXQuote,
  formatUnits,
  privyAuthorizationSignature,
  privyWalletRpcUrl,
  privyWalletTransferUrl,
  type Address
} from "@takeandstake/chain";
import {
  BASE_CHAIN_ID,
  MONAD_CHAIN_ID,
  canPrivyBridgeTo,
  chainOf,
  privyCashAsset,
  privyChainAlias
} from "@takeandstake/shared";
import {
  auroraPollSwap,
  auroraSubmitDeposit,
  kuruBuiltTx,
  kuruFlowPairQuote,
  quoteMonadCash,
  solanaUsdcBalance
} from "@takeandstake/markets";

export type PrivyTransferResult = { ok: true; id?: string; hash?: string | null } | { ok: false; error: string };

function privyAuthHeaders(env: Env, url: string, body: unknown) {
  const signature = privyAuthorizationSignature({
    method: "POST",
    url,
    body,
    privyAppId: env.PRIVY_APP_ID,
    authorizationKey: env.PRIVY_AUTHORIZATION_KEY
  });
  assertNotRawAuthorizationKey(signature, env.PRIVY_AUTHORIZATION_KEY);
  return {
    "content-type": "application/json",
    authorization: `Basic ${Buffer.from(`${env.PRIVY_APP_ID}:${env.PRIVY_APP_SECRET}`).toString("base64")}`,
    "privy-app-id": env.PRIVY_APP_ID,
    "privy-authorization-signature": signature
  };
}

export async function privyTransfer(
  env: Env,
  privyWalletId: string,
  body: {
    amount: string;
    amount_type?: "exact_input" | "exact_output";
    source: { asset: string; chain: string };
    destination: { address: string; chain: string; asset?: string };
  }
): Promise<PrivyTransferResult> {
  if (!env.PRIVY_APP_ID || !env.PRIVY_AUTHORIZATION_KEY) return { ok: false, error: "no_signer" };
  const url = privyWalletTransferUrl(privyWalletId);
  const payload = { amount_type: "exact_output" as const, ...body };
  const res = await fetch(url, {
    method: "POST",
    headers: privyAuthHeaders(env, url, payload),
    body: JSON.stringify(payload)
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    if (res.status === 402 || /gas|sponsor|credit/i.test(text)) return { ok: false, error: "gas_paused" };
    return { ok: false, error: `privy_transfer ${res.status}` };
  }
  const json = (await res.json()) as { id?: string; hash?: string; transaction_hash?: string };
  return { ok: true, id: json.id, hash: json.hash ?? json.transaction_hash ?? null };
}

export async function deskCashUsd(chainId: number, address: string) {
  if (chainId === 101) return (await solanaUsdcBalance(address)) ?? 0;
  try {
    const cash = chainOf(chainId).cash;
    const client = createEvmClient(chainId);
    const raw = await client.readContract({
      address: cash.address as Address,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address as Address]
    });
    return Number(formatUnits(raw, cash.decimals));
  } catch {
    return 0;
  }
}

async function privySendTx(
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

async function persistBridgeTx(data: { chainId: number; txHash: string; status: string }) {
  await prisma.chainTx.create({
    data: { chainId: data.chainId, signer: "PRIVY", txHash: data.txHash, status: data.status, legId: null }
  });
}

async function swapMonadUsdcToAusd(opts: {
  env: Env;
  privyWalletId: string;
  owner: Address;
  usdc: string;
  sellAmount: string;
}) {
  const kuru = await kuruFlowPairQuote({
    sellToken: opts.usdc,
    buyToken: AUSD_MONAD,
    sellAmount: opts.sellAmount
  });
  const kuruTx = kuru ? kuruBuiltTx(kuru.raw) : null;
  if (kuruTx) {
    const hash = await privySendTx(opts.env, opts.privyWalletId, opts.owner, kuruTx, MONAD_CHAIN_ID);
    const rec = await waitReceipt(MONAD_CHAIN_ID, hash);
    if (rec?.status === "success") {
      await persistBridgeTx({ chainId: MONAD_CHAIN_ID, txHash: hash, status: "CONFIRMED" });
      return true;
    }
  }
  if (!opts.env.ZEROX_API_KEY) return false;
  const quote = await fetchZeroXQuote({
    apiKey: opts.env.ZEROX_API_KEY,
    chainId: MONAD_CHAIN_ID,
    sellToken: opts.usdc,
    buyToken: AUSD_MONAD,
    sellAmount: opts.sellAmount,
    taker: opts.owner,
    firm: true
  });
  const spender = quote.issues?.allowance?.spender;
  if (spender) {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: "approve",
      args: [spender as Address, BigInt(opts.sellAmount)]
    });
    const approveHash = await privySendTx(
      opts.env,
      opts.privyWalletId,
      opts.owner,
      { to: opts.usdc, data },
      MONAD_CHAIN_ID
    );
    const rec = await waitReceipt(MONAD_CHAIN_ID, approveHash);
    if (!rec || rec.status !== "success") return false;
  }
  if (!quote.transaction) return false;
  const hash = await privySendTx(opts.env, opts.privyWalletId, opts.owner, quote.transaction, MONAD_CHAIN_ID);
  const rec = await waitReceipt(MONAD_CHAIN_ID, hash);
  if (rec?.status !== "success") return false;
  await persistBridgeTx({ chainId: MONAD_CHAIN_ID, txHash: hash, status: "CONFIRMED" });
  return true;
}

async function fundMonadViaAurora(opts: { env: Env; userId: string; needUsd: number; have: number }) {
  const key = opts.env.AURORA_INTENTS_API_KEY?.trim();
  if (!key) return { ok: false as const, error: "no_privy_route" as const, have: opts.have };
  const dest = await prisma.wallet.findFirst({
    where: { userId: opts.userId, chainId: MONAD_CHAIN_ID, provider: { not: "MERA" } }
  });
  const home = await prisma.wallet.findFirst({
    where: { userId: opts.userId, chainId: BASE_CHAIN_ID, provider: { not: "MERA" }, privyWalletId: { not: null } }
  });
  if (!dest?.address || !home?.privyWalletId) return { ok: false as const, error: "no_wallet" as const, have: opts.have };
  const quoted = await quoteMonadCash({
    apiKey: key,
    needUsd: Math.max(opts.needUsd - opts.have, 0.01),
    recipient: dest.address,
    refundTo: home.address
  });
  if ("error" in quoted) return { ok: false as const, error: quoted.error, have: opts.have };
  const needIn = Number(quoted.amountIn) / 1e6;
  const homeUsd = await deskCashUsd(BASE_CHAIN_ID, home.address);
  if (homeUsd + 1e-6 < needIn) return { ok: false as const, error: "no_cash" as const, have: opts.have };
  const data = encodeFunctionData({
    abi: erc20Abi,
    functionName: "transfer",
    args: [quoted.depositAddress as Address, BigInt(quoted.amountIn)]
  });
  const hash = await privySendTx(opts.env, home.privyWalletId, home.address as Address, { to: USDC_BASE, data }, BASE_CHAIN_ID);
  const rec = await waitReceipt(BASE_CHAIN_ID, hash);
  if (!rec || rec.status !== "success") return { ok: false as const, error: "no_privy_route" as const, have: opts.have };
  await persistBridgeTx({ chainId: BASE_CHAIN_ID, txHash: hash, status: "CONFIRMED" });
  await auroraSubmitDeposit({ apiKey: key, txHash: hash, depositAddress: quoted.depositAddress });
  const swap = await auroraPollSwap(key, quoted.depositAddress);
  if (swap?.destTxHash) {
    await persistBridgeTx({ chainId: MONAD_CHAIN_ID, txHash: swap.destTxHash, status: swap.status === "SUCCESS" ? "CONFIRMED" : swap.status });
  }
  if (swap?.status !== "SUCCESS") return { ok: false as const, error: "no_aurora_route" as const, have: opts.have, hash, persisted: true };
  if (!quoted.destIsAusd && quoted.destAddress && dest.privyWalletId) {
    await swapMonadUsdcToAusd({
      env: opts.env,
      privyWalletId: dest.privyWalletId,
      owner: dest.address as Address,
      usdc: quoted.destAddress,
      sellAmount: quoted.amountOut
    });
  }
  const have = await deskCashUsd(MONAD_CHAIN_ID, dest.address);
  if (have + 1e-6 < opts.needUsd) return { ok: false as const, error: "no_aurora_route" as const, have, hash, persisted: true };
  return { ok: true as const, bridged: true, have, hash, persisted: true };
}

export async function ensureDeskCash(opts: {
  env: Env;
  userId: string;
  destChainId: number;
  needUsd: number;
}) {
  if (opts.destChainId === MONAD_CHAIN_ID) {
    const dest = await prisma.wallet.findFirst({
      where: { userId: opts.userId, chainId: MONAD_CHAIN_ID, provider: { not: "MERA" } }
    });
    const have = dest ? await deskCashUsd(MONAD_CHAIN_ID, dest.address) : 0;
    if (have + 1e-6 >= opts.needUsd) return { ok: true as const, bridged: false, have };
    try {
      return await fundMonadViaAurora({ env: opts.env, userId: opts.userId, needUsd: opts.needUsd, have });
    } catch {
      return { ok: false as const, error: "no_privy_route" as const, have };
    }
  }
  if (!canPrivyBridgeTo(opts.destChainId)) return { ok: false as const, error: "no_privy_route" as const, have: 0 };

  const dest = await prisma.wallet.findFirst({
    where: { userId: opts.userId, chainId: opts.destChainId, provider: { not: "MERA" } }
  });
  if (!dest?.address) return { ok: false as const, error: "no_wallet" as const, have: 0 };
  const have = await deskCashUsd(opts.destChainId, dest.address);
  if (have + 1e-6 >= opts.needUsd) return { ok: true as const, bridged: false, have };

  const home =
    (await prisma.wallet.findFirst({
      where: { userId: opts.userId, chainId: BASE_CHAIN_ID, provider: { not: "MERA" }, privyWalletId: { not: null } }
    })) ??
    (await prisma.wallet.findFirst({
      where: { userId: opts.userId, provider: { not: "MERA" }, privyWalletId: { not: null } }
    }));
  if (!home?.privyWalletId) return { ok: false as const, error: "no_wallet" as const, have };

  const short = opts.needUsd - have;
  const destAlias = privyChainAlias(opts.destChainId);
  const destAsset = privyCashAsset(opts.destChainId);
  if (!destAlias || !destAsset) return { ok: false as const, error: "no_privy_route" as const, have };

  const moved = await privyTransfer(opts.env, home.privyWalletId, {
    amount: short.toFixed(2),
    amount_type: "exact_output",
    source: { asset: "usdc", chain: "base" },
    destination: { address: dest.address, chain: destAlias, asset: destAsset }
  });
  if (!moved.ok) return { ok: false as const, error: moved.error, have };
  return { ok: true as const, bridged: true, have: have + short, hash: moved.hash, actionId: moved.id };
}

export async function bridgeDeskToHome(opts: { env: Env; userId: string; fromChainId: number; amountUsd: number }) {
  if (opts.fromChainId === BASE_CHAIN_ID) return { ok: true as const, bridged: false };
  if (!canPrivyBridgeTo(opts.fromChainId) || opts.fromChainId === 101) {
    if (opts.fromChainId === 101) {
      const from = await prisma.wallet.findFirst({
        where: { userId: opts.userId, chainId: 101, provider: { not: "MERA" }, privyWalletId: { not: null } }
      });
      const home = await prisma.wallet.findFirst({
        where: { userId: opts.userId, chainId: BASE_CHAIN_ID, provider: { not: "MERA" } }
      });
      if (!from?.privyWalletId || !home) return { ok: false as const, error: "no_wallet" as const };
      const moved = await privyTransfer(opts.env, from.privyWalletId, {
        amount: opts.amountUsd.toFixed(2),
        amount_type: "exact_input",
        source: { asset: "usdc", chain: "solana" },
        destination: { address: home.address, chain: "base", asset: "usdc" }
      });
      return moved.ok ? { ok: true as const, bridged: true, hash: moved.hash } : { ok: false as const, error: moved.error };
    }
    return { ok: false as const, error: "no_privy_route" as const };
  }
  const from = await prisma.wallet.findFirst({
    where: { userId: opts.userId, chainId: opts.fromChainId, provider: { not: "MERA" }, privyWalletId: { not: null } }
  });
  const home = await prisma.wallet.findFirst({
    where: { userId: opts.userId, chainId: BASE_CHAIN_ID, provider: { not: "MERA" } }
  });
  const alias = privyChainAlias(opts.fromChainId);
  const asset = privyCashAsset(opts.fromChainId);
  if (!from?.privyWalletId || !home || !alias || !asset) return { ok: false as const, error: "no_wallet" as const };
  const moved = await privyTransfer(opts.env, from.privyWalletId, {
    amount: opts.amountUsd.toFixed(2),
    amount_type: "exact_input",
    source: { asset, chain: alias },
    destination: { address: home.address, chain: "base", asset: "usdc" }
  });
  return moved.ok ? { ok: true as const, bridged: true, hash: moved.hash } : { ok: false as const, error: moved.error };
}
