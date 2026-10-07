import { prisma } from "@takeandstake/db";
import { RH_CORP_ACTIONS_URL } from "@takeandstake/chain";

type RhAction = {
  id?: string;
  type?: string;
  status?: string;
  processDate?: string;
  effectiveDate?: string;
  tokenSymbol?: string;
  symbol?: string;
  rhjId?: string;
  assetId?: string;
  currentMultiplier?: string;
  pendingMultiplier?: string;
  pendingEffectiveAt?: string;
  halt?: boolean;
  isTradingHalt?: boolean;
  details?: unknown;
};

function asDate(value: unknown): Date | null {
  if (!value) return null;
  const d = new Date(String(value));
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function syncCorporateActions() {
  const res = await fetch(RH_CORP_ACTIONS_URL);
  if (!res.ok) throw new Error(`RH corporate-actions ${res.status}`);
  const body = (await res.json()) as { actions?: RhAction[]; results?: RhAction[]; data?: RhAction[] };
  const rows = body.actions ?? body.results ?? body.data ?? (Array.isArray(body) ? (body as RhAction[]) : []);
  let written = 0;
  let applied = 0;
  for (const row of rows) {
    const symbol = String(row.tokenSymbol ?? row.symbol ?? "").toUpperCase();
    if (!symbol) continue;
    const { robinhoodAliases } = await import("@takeandstake/shared");
    const token = await prisma.stockToken.findFirst({
      where: { chainId: 4663, symbol: { in: robinhoodAliases(symbol) } }
    });
    if (!token) continue;
    const rhjId = String(row.id ?? row.rhjId ?? `${token.symbol}:${row.type ?? "action"}:${row.processDate ?? row.effectiveDate ?? ""}`);
    const processDate = asDate(row.processDate ?? row.effectiveDate);
    const details = (row.details ?? row) as object;
    await prisma.corporateAction.upsert({
      where: { rhjId },
      update: {
        tokenId: token.id,
        type: String(row.type ?? "unknown"),
        status: String(row.status ?? "open"),
        processDate,
        details
      },
      create: {
        rhjId,
        tokenId: token.id,
        type: String(row.type ?? "unknown"),
        status: String(row.status ?? "open"),
        processDate,
        details
      }
    });
    written += 1;
    const patch: {
      isTradingHalt?: boolean;
      currentMultiplier?: string;
      pendingMultiplier?: string | null;
      pendingEffectiveAt?: Date | null;
      status?: "HALTED" | "ACTIVE";
    } = {};
    if (typeof row.halt === "boolean" || typeof row.isTradingHalt === "boolean") {
      const halt = Boolean(row.halt ?? row.isTradingHalt);
      patch.isTradingHalt = halt;
      if (halt) patch.status = "HALTED";
    }
    if (row.currentMultiplier) patch.currentMultiplier = String(row.currentMultiplier);
    if (row.pendingMultiplier) patch.pendingMultiplier = String(row.pendingMultiplier);
    const pendingAt = asDate(row.pendingEffectiveAt);
    if (pendingAt) patch.pendingEffectiveAt = pendingAt;
    if (Object.keys(patch).length) {
      await prisma.stockToken.update({ where: { id: token.id }, data: patch });
      applied += 1;
    }
    const kind = String(row.type ?? "").toLowerCase();
    if ((kind.includes("split") || kind.includes("multiplier")) && processDate && processDate.getTime() <= Date.now() && row.currentMultiplier) {
      await applySplitToPaperLots(token.id, String(row.currentMultiplier));
    }
  }
  return { written, applied };
}

async function applySplitToPaperLots(tokenId: string, multiplier: string) {
  const next = BigInt(multiplier);
  if (next <= 0n) return;
  const accounts = await prisma.ledgerAccount.findMany({
    where: { kind: "POSITION", tokenId }
  });
  for (const acc of accounts) {
    const entries = await prisma.ledgerEntry.findMany({ where: { accountId: acc.id } });
    const units = entries.reduce((s, e) => s + BigInt(e.amount.toFixed(0)), 0n);
    if (units === 0n) continue;
    const scaled = (units * next) / 10n ** 18n;
    const delta = scaled - units;
    if (delta === 0n) continue;
    await prisma.$transaction(async (tx) => {
      const ledgerTx = await tx.ledgerTransaction.create({
        data: { pocketId: acc.pocketId, type: "ADJUST" }
      });
      await tx.ledgerEntry.create({
        data: {
          transactionId: ledgerTx.id,
          accountId: acc.id,
          amount: delta.toString(),
          usdValue: 0
        }
      });
    });
  }
}
