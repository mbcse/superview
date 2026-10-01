import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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
      { key: "pause_agent", enabled: false }
    ],
    skipDuplicates: true
  });

  await prisma.user.upsert({
    where: { handle: "demo" },
    update: {},
    create: {
      privyId: "did:privy:demo",
      handle: "demo",
      displayName: "Demo",
      country: "SG",
      jurisdictionStatus: "ALLOWED"
    }
  });

  console.log("Seeded flags and demo user. Run catalog sync for Robinhood tokens.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
