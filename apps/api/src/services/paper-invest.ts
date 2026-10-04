import type { Env } from "@takeandstake/config";
import {
  depositPaperUsd as deposit,
  withdrawPaperUsd as withdraw,
  executePaperRebalance as execute,
  runDryRunInvest as runInvest,
  weightsFromTrimAdd,
  type WeightTarget
} from "@takeandstake/core";

export type { WeightTarget };

function paperEnv(env: Env) {
  return { ZEROX_API_KEY: env.ZEROX_API_KEY, ORACLE_MAX_DEVIATION: env.ORACLE_MAX_DEVIATION };
}

export async function depositPaperUsd(pocketId: string, usd: number) {
  return deposit(pocketId, usd);
}

export async function withdrawPaperUsd(pocketId: string, usd: number) {
  return withdraw(pocketId, usd);
}

export async function runDryRunInvest(pocketId: string, env: Env) {
  return runInvest(pocketId, paperEnv(env));
}

export async function executePaperRebalance(
  pocketId: string,
  env: Env,
  weights: WeightTarget[],
  opts?: { proposalId?: string; cashBps?: number; skipUsd?: number; changeSummary?: string }
) {
  return execute(pocketId, paperEnv(env), weights, opts);
}

export { weightsFromTrimAdd };
