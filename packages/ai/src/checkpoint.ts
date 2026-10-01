import { prisma } from "@takeandstake/db";
import type { AnalystItem, InterpreterOut, PortfolioManagerOut, ScreenerOut, CriticOut } from "./prompts/schemas.js";

export type ScreenPick = ScreenerOut["picks"][number];

export type RunCheckpoint = {
  spec?: InterpreterOut;
  picks?: ScreenPick[];
  screenedSymbols?: string[];
  discoveredNotes?: string[];
  findAllId?: string;
  discoverDone?: boolean;
  diligence?: Record<string, string>;
  analystItems?: AnalystItem[];
  pm?: PortfolioManagerOut;
  skipParallel?: boolean;
};

export function parseCheckpoint(modelVersions: unknown): RunCheckpoint {
  if (!modelVersions || typeof modelVersions !== "object") return {};
  const cp = (modelVersions as { checkpoint?: unknown }).checkpoint;
  if (!cp || typeof cp !== "object") return {};
  return cp as RunCheckpoint;
}

export function mergePicks(a: ScreenPick[] = [], b: ScreenPick[] = []): ScreenPick[] {
  const map = new Map<string, ScreenPick>();
  for (const p of [...a, ...b]) map.set(p.symbol.toUpperCase(), p);
  return [...map.values()];
}

export function uniqSymbols(list: string[] = []) {
  return [...new Set(list.map((s) => s.toUpperCase()))];
}

const locks = new Map<string, Promise<void>>();

async function withRunLock<T>(runId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(runId) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => {
    release = r;
  });
  locks.set(
    runId,
    prev.then(() => next)
  );
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (locks.get(runId) === next) locks.delete(runId);
  }
}

export async function patchCheckpoint(runId: string, patch: Partial<RunCheckpoint>) {
  return withRunLock(runId, async () => {
    const run = await prisma.researchRun.findUnique({ where: { id: runId } });
    const meta =
      run?.modelVersions && typeof run.modelVersions === "object"
        ? { ...(run.modelVersions as Record<string, unknown>) }
        : {};
    const prev = parseCheckpoint(meta);
    const checkpoint: RunCheckpoint = {
      ...prev,
      ...patch,
      picks: patch.picks ? mergePicks(prev.picks, patch.picks) : prev.picks,
      screenedSymbols: uniqSymbols([...(prev.screenedSymbols ?? []), ...(patch.screenedSymbols ?? [])]),
      discoveredNotes: patch.discoveredNotes ?? prev.discoveredNotes,
      diligence: { ...(prev.diligence ?? {}), ...(patch.diligence ?? {}) },
      analystItems: patch.analystItems ?? prev.analystItems
    };
    await prisma.researchRun.update({
      where: { id: runId },
      data: { modelVersions: { ...meta, checkpoint } as object }
    });
    return checkpoint;
  });
}

export async function clearCheckpoint(runId: string, extra: Record<string, unknown>) {
  const run = await prisma.researchRun.findUnique({ where: { id: runId } });
  const meta =
    run?.modelVersions && typeof run.modelVersions === "object"
      ? { ...(run.modelVersions as Record<string, unknown>) }
      : {};
  delete meta.checkpoint;
  await prisma.researchRun.update({
    where: { id: runId },
    data: { modelVersions: { ...meta, ...extra } as object }
  });
}
