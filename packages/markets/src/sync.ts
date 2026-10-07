import { prisma } from "@takeandstake/db";
import { SOLANA_CHAIN_ID } from "@takeandstake/shared";
import { bagsLaunchFeed } from "./bags.js";
import { jupiterSearch, riskFromJupiter } from "./jupiter.js";
import { pumpDiscover, pumpVenue } from "./pump.js";
import { listXStocks } from "./xstocks.js";

export async function syncXStocksCatalog() {
  const rows = await listXStocks();
  let count = 0;
  for (const row of rows) {
    if (!row.mint) continue;
    await prisma.stockToken.upsert({
      where: { chainId_contractAddress: { chainId: SOLANA_CHAIN_ID, contractAddress: row.mint } },
      update: {
        symbol: row.symbol,
        name: row.name,
        world: "STOCKS",
        source: "XSTOCKS",
        venue: "AMM",
        decimals: row.decimals ?? 6,
        xstocksSymbol: row.symbol,
        isin: row.isin,
        logoUrl: row.logo,
        isTradingHalt: Boolean(row.isTradingHalted),
        status: row.isTradingHalted ? "HALTED" : "ACTIVE"
      },
      create: {
        symbol: row.symbol,
        name: row.name,
        contractAddress: row.mint,
        chainId: SOLANA_CHAIN_ID,
        world: "STOCKS",
        source: "XSTOCKS",
        venue: "AMM",
        decimals: row.decimals ?? 6,
        xstocksSymbol: row.symbol,
        isin: row.isin,
        logoUrl: row.logo,
        isTradingHalt: Boolean(row.isTradingHalted),
        status: row.isTradingHalted ? "HALTED" : "ACTIVE"
      }
    });
    count += 1;
  }
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
