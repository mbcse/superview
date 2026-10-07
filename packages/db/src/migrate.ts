import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function tableExists(name: string) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = ${name}
    ) AS exists
  `;
  return Boolean(rows[0]?.exists);
}

async function uniquifyBlankAddresses() {
  const n = await prisma.$executeRaw`
    UPDATE "StockToken"
    SET "contractAddress" = 'pending:' || id
    WHERE btrim("contractAddress") = ''
  `;
  if (n) console.log(`migrate: uniquified ${n} blank StockToken addresses`);
}

async function duplicateGroups() {
  return prisma.$queryRaw<Array<{ chainId: number; contractAddress: string }>>`
    SELECT "chainId", "contractAddress"
    FROM "StockToken"
    GROUP BY "chainId", "contractAddress"
    HAVING COUNT(*) > 1
  `;
}

async function remapToken(from: string, to: string) {
  const keeperUni = await prisma.universeCompany.findUnique({ where: { tokenId: to } });
  if (keeperUni) await prisma.universeCompany.deleteMany({ where: { tokenId: from } });
  else await prisma.universeCompany.updateMany({ where: { tokenId: from }, data: { tokenId: to } });

  await prisma.priceSnapshot.updateMany({ where: { tokenId: from }, data: { tokenId: to } });
  await prisma.corporateAction.updateMany({ where: { tokenId: from }, data: { tokenId: to } });
  await prisma.candidateCompany.updateMany({ where: { resolvedTokenId: from }, data: { resolvedTokenId: to } });

  const extraHoldings = await prisma.targetHolding.findMany({ where: { tokenId: from } });
  for (const h of extraHoldings) {
    const exists = await prisma.targetHolding.findFirst({ where: { targetId: h.targetId, tokenId: to } });
    if (exists) await prisma.targetHolding.delete({ where: { id: h.id } });
    else await prisma.targetHolding.update({ where: { id: h.id }, data: { tokenId: to } });
  }

  if (await tableExists("LedgerAccount")) {
    const extraAccounts = await prisma.ledgerAccount.findMany({ where: { tokenId: from } });
    for (const a of extraAccounts) {
      const exists = await prisma.ledgerAccount.findFirst({
        where: { pocketId: a.pocketId, kind: a.kind, tokenId: to }
      });
      if (exists) await prisma.ledgerAccount.delete({ where: { id: a.id } });
      else await prisma.ledgerAccount.update({ where: { id: a.id }, data: { tokenId: to } });
    }
  }

  if (await tableExists("EvidenceEvent")) {
    await prisma.$executeRaw`UPDATE "EvidenceEvent" SET "tokenId" = ${to} WHERE "tokenId" = ${from}`;
  }
  if (await tableExists("HoldingHealth")) {
    await prisma.$executeRaw`UPDATE "HoldingHealth" SET "tokenId" = ${to} WHERE "tokenId" = ${from}`;
  }
  if (await tableExists("OrderLeg")) {
    await prisma.$executeRaw`UPDATE "OrderLeg" SET "tokenId" = ${to} WHERE "tokenId" = ${from}`;
  }
}

async function collapseDuplicates() {
  const groups = await duplicateGroups();
  let merged = 0;
  for (const g of groups) {
    const rows = await prisma.stockToken.findMany({
      where: { chainId: g.chainId, contractAddress: g.contractAddress },
      include: { universe: true, holdings: true },
      orderBy: { updatedAt: "desc" }
    });
    rows.sort((a, b) => {
      const score = (t: (typeof rows)[number]) =>
        (t.status === "ACTIVE" ? 4 : 0) + (t.universe ? 2 : 0) + (t.holdings.length ? 1 : 0);
      return score(b) - score(a);
    });
    const keeper = rows[0];
    if (!keeper) continue;
    for (const extra of rows.slice(1)) {
      await remapToken(extra.id, keeper.id);
      await prisma.stockToken.delete({ where: { id: extra.id } });
      merged += 1;
    }
  }
  if (merged) console.log(`migrate: merged ${merged} duplicate StockToken rows`);
}

async function main() {
  if (!(await tableExists("StockToken"))) {
    console.log("migrate: StockToken not created yet");
    return;
  }
  await uniquifyBlankAddresses();
  await collapseDuplicates();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
