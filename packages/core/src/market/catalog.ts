import { prisma } from "@takeandstake/db";
import { CHAINLINK_FEEDS_DIRECTORY, RH_ASSETS_URL, RHNVDA_FEED, RHSPY_FEED } from "@takeandstake/chain";
import { ROBINHOOD_CHAIN_ID, normalizeTokenAddress, underlyingTicker } from "@takeandstake/shared";

const KNOWN_FEEDS: Record<string, `0x${string}`> = {
  RHNVDA: RHNVDA_FEED,
  NVDA: RHNVDA_FEED,
  RHSPY: RHSPY_FEED,
  SPY: RHSPY_FEED
};

type RhAsset = {
  id?: string;
  tokenSymbol?: string;
  tokenName?: string;
  isin?: string;
  logoUrl?: string;
  status?: string;
  currentMultiplier?: string;
  pendingMultiplier?: string;
  tradingCapabilities?: unknown;
  deployments?: Array<{ contractAddress?: string; chainId?: number }>;
};

function displayName(tokenName: string, symbol: string) {
  return tokenName.replace(/\s*[•·].*$/, "").replace(/\s*Robinhood Token\s*/i, "").trim() || symbol;
}

export async function syncRobinhoodCatalog() {
  const r = await fetch(RH_ASSETS_URL);
  if (!r.ok) throw new Error(`RH assets ${r.status}`);
  const body = (await r.json()) as { assets?: RhAsset[] };
  const assets = body.assets ?? [];
  const snapshot = await prisma.catalogSnapshot.create({
    data: { hash: String(Date.now()) }
  });
  const seen = new Set<string>();
  const claimed = new Map<string, string>();
  let count = 0;
  const feeds = await loadChainlinkFeeds();

  for (const asset of assets) {
    const symbol = String(asset.tokenSymbol ?? "").toUpperCase();
    const address = normalizeTokenAddress(
      asset.deployments?.find((d) => d.chainId === ROBINHOOD_CHAIN_ID)?.contractAddress ?? "",
      ROBINHOOD_CHAIN_ID
    );
    const ticker = underlyingTicker(symbol, "ROBINHOOD");
    if (!symbol || !address || !ticker) continue;
    if (claimed.has(ticker) && claimed.get(ticker) !== address) continue;
    claimed.set(ticker, address);
    seen.add(address);
    const name = displayName(String(asset.tokenName ?? symbol), symbol);
    const feedAddress = feeds.get(symbol) ?? KNOWN_FEEDS[symbol] ?? undefined;
    const token = await prisma.stockToken.upsert({
      where: { chainId_contractAddress: { chainId: ROBINHOOD_CHAIN_ID, contractAddress: address } },
      update: {
        symbol,
        name,
        snapshotId: snapshot.id,
        world: "STOCKS",
        source: "ROBINHOOD",
        venue: "RH_BOOK",
        underlyingTicker: ticker,
        decimals: 18,
        rhjId: asset.id,
        isin: asset.isin,
        currentMultiplier: asset.currentMultiplier ?? undefined,
        pendingMultiplier: asset.pendingMultiplier || undefined,
        logoUrl: asset.logoUrl,
        tradingCapabilities: asset.tradingCapabilities as object | undefined,
        status: asset.status?.includes("ACTIVE") ? "ACTIVE" : "INACTIVE",
        isTradingHalt: false,
        feedAddress: feedAddress ?? undefined
      },
      create: {
        symbol,
        name,
        contractAddress: address,
        chainId: ROBINHOOD_CHAIN_ID,
        world: "STOCKS",
        source: "ROBINHOOD",
        venue: "RH_BOOK",
        underlyingTicker: ticker,
        decimals: 18,
        snapshotId: snapshot.id,
        rhjId: asset.id,
        isin: asset.isin,
        currentMultiplier: asset.currentMultiplier ?? "1000000000000000000",
        logoUrl: asset.logoUrl,
        tradingCapabilities: asset.tradingCapabilities as object | undefined,
        status: asset.status?.includes("ACTIVE") ? "ACTIVE" : "INACTIVE",
        feedAddress: feedAddress ?? null
      }
    });
    await prisma.universeCompany.upsert({
      where: { tokenId: token.id },
      update: { legalName: name, isin: asset.isin ?? undefined },
      create: { tokenId: token.id, legalName: name, isin: asset.isin, businessSummary: "" }
    });
    count += 1;
  }

  if (count) {
    await prisma.stockToken.updateMany({
      where: {
        chainId: ROBINHOOD_CHAIN_ID,
        source: "ROBINHOOD",
        status: "ACTIVE",
        contractAddress: { notIn: [...seen] }
      },
      data: { status: "INACTIVE" }
    });
  }

  const fake = await prisma.stockToken.findMany({
    where: { chainId: ROBINHOOD_CHAIN_ID, contractAddress: { startsWith: "0xRH" } },
    select: { id: true }
  });
  for (const row of fake) {
    await prisma.universeCompany.deleteMany({ where: { tokenId: row.id } });
    await prisma.stockToken.delete({ where: { id: row.id } }).catch(() => {});
  }

  return { snapshotId: snapshot.id, count };
}

async function loadChainlinkFeeds(): Promise<Map<string, `0x${string}`>> {
  const map = new Map<string, `0x${string}`>();
  try {
    const res = await fetch(CHAINLINK_FEEDS_DIRECTORY);
    if (!res.ok) return map;
    const rows = (await res.json()) as Array<{
      name?: string;
      proxyAddress?: string;
      docs?: { baseAssetEntityId?: string };
    }>;
    for (const row of rows) {
      const proxy = row.proxyAddress as `0x${string}` | undefined;
      if (!proxy) continue;
      const fromName = String(row.name ?? "").match(/Robinhood\s+([A-Z0-9]+)-USD/i)?.[1];
      const fromDoc = String(row.docs?.baseAssetEntityId ?? "").replace(/^crypto-RH/i, "");
      const sym = (fromName ?? fromDoc).toUpperCase();
      if (sym) {
        map.set(sym, proxy);
        map.set(`RH${sym}`, proxy);
      }
    }
  } catch {
    /* directory optional */
  }
  return map;
}

void KNOWN_FEEDS;
