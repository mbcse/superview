import { prisma } from "@takeandstake/db";
import {
  BASE_CHAIN_ID,
  MONAD_CHAIN_ID,
  SOLANA_CHAIN_ID,
  SNAPSHOT_PRICE_MAX,
  SNAPSHOT_VOLUME_MAX,
  finiteDecimal,
  normalizeTokenAddress,
  roundMoney,
  underlyingTicker
} from "@takeandstake/shared";
import type { PriceSource } from "./types.js";
import { bagsLaunchFeed } from "./bags.js";
import { jupiterSearch, riskFromJupiter } from "./jupiter.js";
import { pumpDiscover, pumpVenue } from "./pump.js";
import { listXStocks, xstockChainId, type XStockNetwork } from "./xstocks.js";
import { coinbaseMultiplierWad, listCoinbaseBaseStocks, quoteByAddress } from "./coinbase-base.js";
import { dexScreenerQuotes } from "./dexscreener.js";

export async function writePriceSnapshot(input: {
  tokenId: string;
  source: PriceSource;
  price: unknown;
  volumeUsd?: unknown;
  updatedAt?: Date | null;
}) {
  const price = finiteDecimal(input.price, SNAPSHOT_PRICE_MAX);
  if (price == null) return false;
  const updatedAt =
    input.updatedAt instanceof Date && !Number.isNaN(input.updatedAt.getTime()) ? input.updatedAt : new Date();
  const volume = finiteDecimal(input.volumeUsd, SNAPSHOT_VOLUME_MAX);
  try {
    await prisma.priceSnapshot.create({
      data: {
        tokenId: input.tokenId,
        source: input.source,
        price,
        volumeUsd: volume != null ? roundMoney(volume, 2) : undefined,
        halt: false,
        updatedAt
      }
    });
    return true;
  } catch {
    return false;
  }
}

export async function syncXStocksCatalog(network: XStockNetwork = "Solana") {
  const rows = await listXStocks(network);
  const chainId = xstockChainId(network);
  const venue = chainId === MONAD_CHAIN_ID ? "KURU_FLOW" : "AMM";
  let count = 0;
  const seen: string[] = [];
  const claimed = new Map<string, string>();
  for (const row of rows) {
    const mint = normalizeTokenAddress(row.mint ?? "", chainId);
    if (!mint) continue;
    const ticker = underlyingTicker(row.symbol, "XSTOCKS");
    if (!ticker) continue;
    if (claimed.has(ticker) && claimed.get(ticker) !== mint) continue;
    claimed.set(ticker, mint);
    await prisma.stockToken.upsert({
      where: { chainId_contractAddress: { chainId, contractAddress: mint } },
      update: {
        symbol: row.symbol,
        name: row.name,
        world: "STOCKS",
        source: "XSTOCKS",
        venue,
        decimals: row.decimals ?? 6,
        xstocksSymbol: row.symbol,
        underlyingTicker: ticker,
        isin: row.isin,
        logoUrl: row.logo,
        isTradingHalt: Boolean(row.isTradingHalted),
        status: row.isTradingHalted ? "HALTED" : "ACTIVE"
      },
      create: {
        symbol: row.symbol,
        name: row.name,
        contractAddress: mint,
        chainId,
        world: "STOCKS",
        source: "XSTOCKS",
        venue,
        decimals: row.decimals ?? 6,
        xstocksSymbol: row.symbol,
        underlyingTicker: ticker,
        isin: row.isin,
        logoUrl: row.logo,
        isTradingHalt: Boolean(row.isTradingHalted),
        status: row.isTradingHalted ? "HALTED" : "ACTIVE"
      }
    });
    count += 1;
    seen.push(mint);
    await copyUniverseFromSibling(chainId, mint, ticker, row.name, row.isin);
  }
  if (seen.length) {
    await prisma.stockToken.updateMany({
      where: {
        chainId,
        source: "XSTOCKS",
        status: { in: ["ACTIVE", "HALTED"] },
        contractAddress: { notIn: seen }
      },
      data: { status: "INACTIVE" }
    });
  }
  return { count, chainId };
}

export async function copyUniverseFromSibling(
  chainId: number,
  contractAddress: string,
  ticker: string,
  legalName: string,
  isin?: string | null
) {
  const token = await prisma.stockToken.findUnique({
    where: { chainId_contractAddress: { chainId, contractAddress } }
  });
  if (!token) return;
  const existing = await prisma.universeCompany.findUnique({ where: { tokenId: token.id } });
  if (existing?.businessSummary) return;
  const sibling = ticker
    ? await prisma.universeCompany.findFirst({
        where: {
          token: { underlyingTicker: ticker, id: { not: token.id } },
          businessSummary: { not: "" }
        }
      })
    : null;
  await prisma.universeCompany.upsert({
    where: { tokenId: token.id },
    update: {
      legalName: existing?.legalName || legalName,
      isin: existing?.isin ?? isin ?? sibling?.isin ?? undefined,
      businessSummary: existing?.businessSummary || sibling?.businessSummary || "",
      sector: existing?.sector ?? sibling?.sector ?? undefined,
      industry: existing?.industry ?? sibling?.industry ?? undefined
    },
    create: {
      tokenId: token.id,
      legalName,
      isin: isin ?? sibling?.isin ?? undefined,
      businessSummary: sibling?.businessSummary ?? "",
      sector: sibling?.sector ?? undefined,
      industry: sibling?.industry ?? undefined
    }
  });
}

export async function syncCoinbaseBaseCatalog() {
  const rows = await listCoinbaseBaseStocks();
  if (!rows.length) return { count: 0, skipped: "empty_issuer_list" as const };
  const dex = await dexScreenerQuotes(
    rows.map((row) => row.address),
    { chain: "base", symbols: new Map(rows.map((row) => [row.address, row.symbol])) }
  );
  const seen: string[] = [];
  const claimed = new Map<string, string>();
  const claimedIsin = new Map<string, string>();
  let count = 0;
  for (const row of rows) {
    const ticker = underlyingTicker(row.symbol, "COINBASE");
    if (!ticker) continue;
    if (claimed.has(ticker) && claimed.get(ticker) !== row.address) continue;
    if (row.isin && claimedIsin.has(row.isin) && claimedIsin.get(row.isin) !== row.address) continue;
    claimed.set(ticker, row.address);
    if (row.isin) claimedIsin.set(row.isin, row.address);
    const market = quoteByAddress(dex, row.address);
    const live = row.navFresh || Boolean(market?.last && market.last > 0);
    const liquidityUsd = finiteDecimal(market?.liquidityUsd, SNAPSHOT_VOLUME_MAX);
    try {
      await prisma.stockToken.upsert({
        where: { chainId_contractAddress: { chainId: BASE_CHAIN_ID, contractAddress: row.address } },
        update: {
          symbol: row.symbol,
          name: row.name,
          world: "STOCKS",
          source: "COINBASE",
          venue: "ZEROX_EVM",
          decimals: row.decimals,
          underlyingTicker: ticker,
          isin: row.isin ?? undefined,
          logoUrl: row.logoUrl ?? undefined,
          currentMultiplier: coinbaseMultiplierWad(row.multiplier),
          liquidityUsd: liquidityUsd ?? undefined,
          status: "ACTIVE",
          isTradingHalt: false,
          tradingCapabilities: { live, redeemPaused: row.redeemPaused }
        },
        create: {
          symbol: row.symbol,
          name: row.name,
          contractAddress: row.address,
          chainId: BASE_CHAIN_ID,
          world: "STOCKS",
          source: "COINBASE",
          venue: "ZEROX_EVM",
          decimals: row.decimals,
          underlyingTicker: ticker,
          isin: row.isin ?? undefined,
          logoUrl: row.logoUrl ?? undefined,
          currentMultiplier: coinbaseMultiplierWad(row.multiplier),
          liquidityUsd: liquidityUsd ?? undefined,
          status: "ACTIVE",
          tradingCapabilities: { live, redeemPaused: row.redeemPaused }
        }
      });
      const token = await prisma.stockToken.findUnique({
        where: { chainId_contractAddress: { chainId: BASE_CHAIN_ID, contractAddress: row.address } }
      });
      if (token && row.navUpdatedAt) {
        await writePriceSnapshot({
          tokenId: token.id,
          source: "CHAINLINK",
          price: row.navPrice,
          updatedAt: row.navUpdatedAt
        });
      }
      if (token) {
        await writePriceSnapshot({
          tokenId: token.id,
          source: "DEXSCREENER",
          price: market?.last,
          volumeUsd: liquidityUsd,
          updatedAt: market?.observedAt ? new Date(market.observedAt) : undefined
        });
      }
      await copyUniverseFromSibling(BASE_CHAIN_ID, row.address, ticker, row.name, row.isin);
      seen.push(row.address);
      count += 1;
    } catch {
      continue;
    }
  }
  await prisma.stockToken.updateMany({
    where: {
      chainId: BASE_CHAIN_ID,
      source: "COINBASE",
      status: "ACTIVE",
      contractAddress: { notIn: seen }
    },
    data: { status: "INACTIVE" }
  });
  return { count };
}

export async function syncBagsCatalog() {
  const rows = await bagsLaunchFeed();
  let count = 0;
  for (const row of rows) {
    const venue = /PRE|GRAD|CURVE/i.test(row.status ?? "PRE_GRAD") && !/MIGRATED/i.test(row.status ?? "")
      ? "BAGS_CURVE"
      : "AMM";
    await prisma.stockToken.upsert({
      where: { chainId_contractAddress: { chainId: row.chainId, contractAddress: row.mint } },
      update: {
        symbol: row.symbol,
        name: row.name,
        world: "MEMES",
        source: "BAGS",
        venue,
        logoUrl: row.image,
        launchedAt: row.createdAt ? new Date(row.createdAt) : undefined,
        status: "ACTIVE"
      },
      create: {
        symbol: row.symbol,
        name: row.name,
        contractAddress: row.mint,
        chainId: row.chainId,
        world: "MEMES",
        source: "BAGS",
        venue,
        decimals: 6,
        logoUrl: row.image,
        launchedAt: row.createdAt ? new Date(row.createdAt) : undefined,
        status: "ACTIVE"
      }
    });
    count += 1;
  }
  return { count };
}

export async function syncJupiterMemeCatalog(queries = ["pump", "bags", "meme"]) {
  let count = 0;
  for (const q of queries) {
    const rows = q === "pump" ? await pumpDiscover("pump") : await jupiterSearch(q);
    for (const row of rows.slice(0, 40)) {
      const source = /bags/i.test(String(row.launchpad ?? ""))
        ? "BAGS"
        : /pump/i.test(String(row.launchpad ?? ""))
          ? "PUMPFUN"
          : "OTHER";
      const venue = pumpVenue(row);
      const risk = riskFromJupiter(row);
      await prisma.stockToken.upsert({
        where: { chainId_contractAddress: { chainId: SOLANA_CHAIN_ID, contractAddress: row.id } },
        update: {
          symbol: row.symbol || row.id.slice(0, 6),
          name: row.name || row.symbol || row.id,
          world: "MEMES",
          source,
          venue,
          decimals: row.decimals ?? 6,
          logoUrl: row.icon,
          liquidityUsd: row.liquidity ?? undefined,
          holderCount: row.holderCount ?? undefined,
          riskFlags: risk,
          launchedAt: row.createdAt ? new Date(row.createdAt) : undefined,
          graduatedAt: row.graduatedAt ? new Date(row.graduatedAt) : undefined,
          status: risk.isSus ? "INACTIVE" : "ACTIVE"
        },
        create: {
          symbol: row.symbol || row.id.slice(0, 6),
          name: row.name || row.symbol || row.id,
          contractAddress: row.id,
          chainId: SOLANA_CHAIN_ID,
          world: "MEMES",
          source,
          venue,
          decimals: row.decimals ?? 6,
          logoUrl: row.icon,
          liquidityUsd: row.liquidity ?? undefined,
          holderCount: row.holderCount ?? undefined,
          riskFlags: risk,
          launchedAt: row.createdAt ? new Date(row.createdAt) : undefined,
          graduatedAt: row.graduatedAt ? new Date(row.graduatedAt) : undefined,
          status: risk.isSus ? "INACTIVE" : "ACTIVE"
        }
      });
      count += 1;
    }
  }
  return { count };
}

export async function refreshMemeRisk(heldOnly = false) {
  const held = heldOnly
    ? await prisma.ledgerAccount.findMany({
        where: { kind: "POSITION" },
        select: { tokenId: true },
        distinct: ["tokenId"]
      })
    : [];
  const tokens = await prisma.stockToken.findMany({
    where: {
      world: "MEMES",
      status: "ACTIVE",
      ...(heldOnly ? { id: { in: held.flatMap((h) => (h.tokenId ? [h.tokenId] : [])) } } : {})
    },
    take: heldOnly ? 80 : 200,
    orderBy: { updatedAt: "desc" }
  });
  if (!tokens.length) return { n: 0 };
  const { getMultipleAccounts } = await import("./solana-rpc.js");
  const { token2022RiskFromMint } = await import("./token2022.js");
  const { jupiterSwapQuote } = await import("./jupiter.js");
  const accounts = await getMultipleAccounts(tokens.map((t) => t.contractAddress));
  let n = 0;
  for (const t of tokens) {
    const acc = accounts.find((a) => a.pubkey === t.contractAddress);
    const ext = acc?.data ? token2022RiskFromMint(acc.data) : [];
    const info = (await jupiterSearch(t.contractAddress))[0];
    const venue = info ? pumpVenue(info) : t.venue;
    const sell = await jupiterSwapQuote({
      asset: {
        id: t.id,
        symbol: t.symbol,
        chainId: t.chainId,
        contractAddress: t.contractAddress,
        decimals: t.decimals
      },
      side: "SELL",
      amountUsd: 5,
      owner: ""
    });
    const noExit = !sell || Number(t.liquidityUsd ?? info?.liquidity ?? 0) < 50_000;
    const nextRisk = {
      ...((t.riskFlags as object) ?? {}),
      ...(info ? riskFromJupiter(info) : {}),
      token2022Risk: ext,
      noExit
    };
    await prisma.stockToken.update({
      where: { id: t.id },
      data: {
        venue,
        liquidityUsd: info?.liquidity ?? t.liquidityUsd,
        holderCount: info?.holderCount ?? t.holderCount,
        riskFlags: nextRisk,
        graduatedAt: info?.graduatedAt ? new Date(info.graduatedAt) : t.graduatedAt,
        status: nextRisk.isSus ? "INACTIVE" : "ACTIVE"
      }
    });
    n += 1;
  }
  return { n };
}
