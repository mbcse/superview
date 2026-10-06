import { createHash } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function receiptHash(payload: unknown) {
  const json = stable(payload);
  return createHash("sha256").update(json).digest("hex");
}

function stable(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(obj[k])}`).join(",")}}`;
}

const NAMES = [
  { handle: "demo", displayName: "Demo", privyId: "did:privy:demo" },
  { handle: "mira", displayName: "Mira Chen", privyId: "did:privy:mira" },
  { handle: "kai", displayName: "Kai Okonkwo", privyId: "did:privy:kai" }
];

const TOKEN_SEED = [
  { symbol: "NVDA", name: "NVIDIA" },
  { symbol: "AAPL", name: "Apple" },
  { symbol: "MSFT", name: "Microsoft" },
  { symbol: "TSLA", name: "Tesla" },
  { symbol: "AMZN", name: "Amazon" },
  { symbol: "GOOGL", name: "Alphabet" },
  { symbol: "META", name: "Meta" },
  { symbol: "JPM", name: "JPMorgan" },
  { symbol: "AVGO", name: "Broadcom" },
  { symbol: "TSM", name: "TSMC" }
];

const VIEWS: Array<{
  handle: string;
  sentence: string;
  horizon: string;
  falsifier: string;
  symbols: Array<{ symbol: string; weightBps: number; why: string }>;
  cashBps: number;
  alpha: number;
  world?: "STOCKS" | "MEMES";
  chainId?: number;
  lens?: "BELIEF" | "SKY";
  astrologySystem?: "VEDIC" | "WESTERN";
  astrologyChart?: string;
}> = [
  {
    handle: "demo",
    sentence: "Robots will be big.",
    horizon: "5y",
    falsifier: "No scaled consumer humanoid deployments by 2030.",
    cashBps: 800,
    alpha: 0.18,
    symbols: [
      { symbol: "NVDA", weightBps: 3200, why: "Train and infer the robot stack." },
      { symbol: "TSLA", weightBps: 2800, why: "Optimus is the consumer bet." },
      { symbol: "AMZN", weightBps: 2200, why: "Warehouse robots compound fulfillment." }
    ]
  },
  {
    handle: "mira",
    sentence: "The power grid cannot keep up with data centers.",
    horizon: "4y",
    falsifier: "US generation additions outpace AI load for two years.",
    cashBps: 500,
    alpha: 0.11,
    symbols: [
      { symbol: "NVDA", weightBps: 3000, why: "The load is the GPU buildout." },
      { symbol: "MSFT", weightBps: 3200, why: "Hyperscaler that must buy the power." },
      { symbol: "AVGO", weightBps: 2300, why: "Networking silicon in the same build." }
    ]
  },
  {
    handle: "kai",
    sentence: "GLP-1 drugs will reshape food and apparel demand.",
    horizon: "6y",
    falsifier: "GLP-1 adherence collapses outside diabetes.",
    cashBps: 1000,
    alpha: -0.04,
    symbols: [
      { symbol: "AMZN", weightBps: 3500, why: "Grocery mix shifts with smaller baskets." },
      { symbol: "META", weightBps: 2800, why: "Ad demand follows body-image categories." },
      { symbol: "AAPL", weightBps: 1700, why: "Health sensors sit next to the thesis." }
    ]
  },
  {
    handle: "mira",
    sentence: "China is winning the EV supply chain.",
    horizon: "5y",
    falsifier: "Western battery costs undercut CATL-class players by 2028.",
    cashBps: 700,
    alpha: 0.07,
    symbols: [
      { symbol: "TSLA", weightBps: 4200, why: "The Western OEM most exposed to China cost." },
      { symbol: "TSM", weightBps: 2800, why: "Auto silicon still runs through foundry." },
      { symbol: "GOOGL", weightBps: 1300, why: "Maps and autonomy software stack." }
    ]
  },
  {
    handle: "kai",
    sentence: "Foundry capacity is the bottleneck.",
    horizon: "3y",
    falsifier: "Leading-edge capacity is in surplus for four quarters.",
    cashBps: 400,
    alpha: 0.22,
    symbols: [
      { symbol: "TSM", weightBps: 3800, why: "The scarce leading-edge node." },
      { symbol: "NVDA", weightBps: 3000, why: "Buys every extra wafer it can." },
      { symbol: "AVGO", weightBps: 1800, why: "Custom ASICs compete for the same lines." }
    ]
  },
  {
    handle: "demo",
    sentence: "People pay for attention.",
    horizon: "4y",
    falsifier: "Ad load and subscription ARPU both stall.",
    cashBps: 600,
    alpha: 0.09,
    symbols: [
      { symbol: "META", weightBps: 3600, why: "The attention marketplace." },
      { symbol: "GOOGL", weightBps: 3200, why: "Search and YouTube still collect the rent." },
      { symbol: "AAPL", weightBps: 1600, why: "Services tax on the same hours." }
    ]
  },
  {
    handle: "mira",
    sentence: "Labor stays tight and wages keep pressure on operating costs.",
    lens: "SKY",
    astrologySystem: "VEDIC",
    astrologyChart:
      "Saturn transits the 10th. Sade Sati on the mundane labor house. Mars aspects the 6th of employment. Current dasha favors Shani.",
    horizon: "3y",
    falsifier: "Unemployment rises for two consecutive years while wage growth cools below inflation.",
    cashBps: 800,
    alpha: 0.06,
    symbols: [
      { symbol: "AMZN", weightBps: 3400, why: "Fulfillment labor is the wage bill that Saturn on the 10th describes." },
      { symbol: "MSFT", weightBps: 3000, why: "Enterprise software sits next to scarce skilled labor." },
      { symbol: "META", weightBps: 1800, why: "Hiring cycles and ad labor follow the same tightness." }
    ]
  }
];

function seedAddress(symbol: string) {
  const hex = createHash("sha256").update(`superview-seed:${symbol}`).digest("hex").slice(0, 40);
  return `0x${hex}`;
}

async function upsertUser(row: (typeof NAMES)[number]) {
  return prisma.user.upsert({
    where: { handle: row.handle },
    update: { displayName: row.displayName, jurisdictionStatus: "ALLOWED", country: "SG" },
    create: {
      privyId: row.privyId,
      handle: row.handle,
      displayName: row.displayName,
      country: "SG",
      jurisdictionStatus: "ALLOWED"
    }
  });
}

async function resolveToken(symbol: string, name: string, allowCreate: boolean) {
  const variants = [symbol, `RH${symbol}`];
  const existing = await prisma.stockToken.findFirst({
    where: { chainId: 4663, symbol: { in: variants } }
  });
  if (existing) return existing;
  if (!allowCreate) return null;
  return prisma.stockToken.create({
    data: {
      symbol,
      name,
      contractAddress: seedAddress(symbol),
      chainId: 4663,
      world: "STOCKS",
      source: "ROBINHOOD",
      venue: "RH_BOOK",
      decimals: 18,
      status: "ACTIVE",
      universe: {
        create: {
          legalName: name,
          businessSummary: `${name} is a listed company with a Robinhood Chain stock token.`,
          sector: "Technology"
        }
      }
    }
  });
}

async function seedView(
  authorId: string,
  view: (typeof VIEWS)[number],
  tokens: Map<string, { id: string; symbol: string }>
) {
  const found = await prisma.take.findFirst({
    where: { status: "PUBLISHED", revisions: { some: { sentence: view.sentence } } },
    include: { revisions: { take: 1, orderBy: { number: "desc" } } }
  });
  if (found) return found;

  const holdings = view.symbols
    .map((h) => {
      const token = tokens.get(h.symbol) ?? tokens.get(`RH${h.symbol}`);
      return token ? { ...h, token } : null;
    })
    .filter((h): h is NonNullable<typeof h> => Boolean(h));
  if (!holdings.length) return null;

  const cashBps = 10_000 - holdings.reduce((s, h) => s + h.weightBps, 0);
  const target = await prisma.portfolioTarget.create({
    data: {
      cashBps: cashBps > 0 ? cashBps : view.cashBps,
      holdings: {
        create: holdings.map((h) => ({
          tokenId: h.token.id,
          weightBps: h.weightBps,
          rationale: h.why
        }))
      }
    }
  });
  const canonical = {
    sentence: view.sentence,
    holdings: holdings.map((h) => ({ symbol: h.token.symbol, weightBps: h.weightBps })),
    cashBps: target.cashBps
  };
  const receipt = { sha256: receiptHash(canonical) };
  const take = await prisma.take.create({
    data: {
      authorId,
      status: "PUBLISHED",
      visibility: "PUBLIC",
      world: view.world ?? "STOCKS",
      chainId: view.chainId ?? (view.world === "MEMES" ? 101 : 4663),
      lens: view.lens ?? "BELIEF",
      astrologySystem: view.astrologySystem,
      seeded: true,
      createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)
    }
  });
  const run =
    view.sentence === "Robots will be big."
      ? await prisma.researchRun.create({
          data: {
            takeId: take.id,
            status: "DRAFT",
            stage: "draft",
            modelVersions: {
              view: view.sentence,
              checkpoint: { spec: { normalizedView: view.sentence, refuse: false } }
            },
            finishedAt: new Date(),
            thesis: {
              create: {
                normalizedTake: view.sentence,
                interpretation: "Household and warehouse robotics scale on cheaper compute and actuators.",
                mechanism: "GPU, OEM, and fulfillment names capture the spend.",
                horizon: view.horizon,
                falsifiers: [view.falsifier],
                refuse: false
              }
            },
            events: {
              create: {
                stage: "draft",
                message: "Seeded stage thesis",
                payload: {
                  holdings: holdings.map((h) => ({ symbol: h.token.symbol, weightBps: h.weightBps })),
                  cashBps: target.cashBps
                }
              }
            }
          }
        })
      : null;
  const revision = await prisma.takeRevision.create({
    data: {
      takeId: take.id,
      number: 1,
      sentence: view.sentence,
      horizon: view.horizon,
      falsifier: view.falsifier,
      astrologyChart: view.astrologyChart,
      origin: "AUTHOR",
      targetId: target.id,
      researchRunId: run?.id,
      receipt: { create: { canonicalJson: canonical, sha256: `${receipt.sha256}:${take.id}`.slice(0, 64) } }
    }
  });
  await prisma.take.update({
    where: { id: take.id },
    data: { currentRevisionId: revision.id }
  });
  await prisma.takeManagement.upsert({
    where: { takeId: take.id },
    update: {},
    create: { takeId: take.id, mode: "AUTO" }
  });

  const now = Date.now();
  const points: Array<{ asOf: Date; indexValue: number; benchmarkIndex: number }> = [];
  for (let d = 8; d >= 0; d--) {
    for (const hour of [14, 18, 21]) {
      const t = d + hour / 24;
      const book = 100 + view.alpha * (8 - d) + Math.sin(hour + view.alpha * 10) * 0.15;
      const spy = 100 + 0.04 * (8 - d) + Math.sin(hour) * 0.05;
      points.push({
        asOf: new Date(now - t * 24 * 60 * 60 * 1000),
        indexValue: Number(book.toFixed(4)),
        benchmarkIndex: Number(spy.toFixed(4))
      });
    }
  }
  await prisma.takeValuation.createMany({
    data: points.map((p) => ({
      takeId: take.id,
      revisionId: revision.id,
      asOf: p.asOf,
      indexValue: p.indexValue,
      benchmarkIndex: p.benchmarkIndex,
      isDaily: p.asOf.getUTCHours() === 21
    }))
  });
  return take;
}

async function main() {
  await prisma.featureFlag.createMany({
    data: [
      { key: "live_trading", enabled: false },
      { key: "withdrawals", enabled: false },
      { key: "auto_dry_run", enabled: true },
      { key: "auto_live", enabled: false },
      { key: "deep_research", enabled: true },
      { key: "daily_cycles", enabled: true },
      { key: "pause_trading", enabled: false },
      { key: "pause_agent", enabled: false },
      { key: "live_trading_xstocks", enabled: false },
      { key: "live_trading_memes", enabled: false },
      { key: "live_rh_bags", enabled: false }
    ],
    skipDuplicates: true
  });
  await prisma.featureFlag.update({ where: { key: "live_trading" }, data: { enabled: false } }).catch(() => {});

  const users = new Map<string, string>();
  for (const n of NAMES) {
    const u = await upsertUser(n);
    users.set(n.handle, u.id);
  }

  const tokenCount = await prisma.stockToken.count();
  const allowCreate = tokenCount === 0;
  const tokens = new Map<string, { id: string; symbol: string }>();
  for (const t of TOKEN_SEED) {
    const row = await resolveToken(t.symbol, t.name, allowCreate);
    if (!row) continue;
    tokens.set(t.symbol, { id: row.id, symbol: row.symbol });
    tokens.set(row.symbol, { id: row.id, symbol: row.symbol });
  }

  let published = 0;
  for (const view of VIEWS) {
    const authorId = users.get(view.handle);
    if (!authorId) continue;
    const take = await seedView(authorId, view, tokens);
    if (take) published += 1;
  }

  const memeTokens = await ensureMemeTokens();
  const memeViews = memeViewSpecs(memeTokens);
  for (const view of memeViews) {
    const authorId = users.get(view.handle);
    if (!authorId) continue;
    const take = await seedView(authorId, view, memeTokens);
    if (take) published += 1;
  }

  await prisma.take.updateMany({
    where: { revisions: { some: { sentence: { in: [...VIEWS, ...memeViews].map((v) => v.sentence) } } } },
    data: { seeded: true }
  });

  console.log(`Seeded flags, ${users.size} users, ${published} published views. Seeded charts are illustrative. live_trading stays off.`);
}

async function ensureMemeTokens() {
  const existing = await prisma.stockToken.findMany({
    where: { world: "MEMES", status: "ACTIVE" },
    orderBy: { updatedAt: "desc" },
    take: 12
  });
  if (existing.length >= 3) {
    return new Map(existing.map((t) => [t.symbol, { id: t.id, symbol: t.symbol }]));
  }
  const fallback = [
    { symbol: "DOGE", name: "Dog culture", mint: "DoGe1111111111111111111111111111111111112" },
    { symbol: "FROG", name: "Frog culture", mint: "Fr0g1111111111111111111111111111111111112" },
    { symbol: "CAT", name: "Cat culture", mint: "Catt1111111111111111111111111111111111112" }
  ];
  const tokens = new Map<string, { id: string; symbol: string }>();
  for (const row of existing) tokens.set(row.symbol, { id: row.id, symbol: row.symbol });
  for (const t of fallback) {
    if (tokens.size >= 6) break;
    const created = await prisma.stockToken.upsert({
      where: { chainId_contractAddress: { chainId: 101, contractAddress: t.mint } },
      update: { world: "MEMES", source: "PUMPFUN", venue: "PUMP_CURVE", status: "ACTIVE" },
      create: {
        symbol: t.symbol,
        name: t.name,
        contractAddress: t.mint,
        chainId: 101,
        world: "MEMES",
        source: "PUMPFUN",
        venue: "PUMP_CURVE",
        decimals: 6,
        status: "ACTIVE",
        liquidityUsd: 120_000
      }
    });
    tokens.set(created.symbol, { id: created.id, symbol: created.symbol });
  }
  return tokens;
}

function memeViewSpecs(tokens: Map<string, { id: string; symbol: string }>) {
  const symbols = [...tokens.keys()].slice(0, 6);
  const take3 = (offset: number) =>
    symbols.slice(offset, offset + 3).map((symbol, i) => ({
      symbol,
      weightBps: i === 0 ? 4000 : i === 1 ? 3200 : 2000,
      why: "Fits the launch narrative."
    }));
  return [
    {
      handle: "kai",
      sentence: "Launchpads will keep minting culture coins.",
      horizon: "30d",
      falsifier: "New launches dry up for two weeks.",
      cashBps: 800,
      alpha: 0.28,
      world: "MEMES" as const,
      chainId: 101,
      symbols: take3(0)
    },
    {
      handle: "mira",
      sentence: "Dogs and frogs still run the timeline.",
      horizon: "14d",
      falsifier: "Animal coins lose the top of the tape.",
      cashBps: 600,
      alpha: 0.15,
      world: "MEMES" as const,
      chainId: 101,
      symbols: take3(symbols.length > 3 ? 1 : 0)
    }
  ].filter((v) => v.symbols.length >= 3);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
