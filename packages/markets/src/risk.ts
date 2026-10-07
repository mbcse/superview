import {
  MEME_MAX_DEV_BALANCE,
  MEME_MAX_TOP_HOLDERS,
  MEME_MIN_AGE_MS,
  MEME_MIN_LIQUIDITY_USD
} from "@takeandstake/shared";
import type { RiskFlags } from "./types.js";

const RISKY_EXTS = ["transferHook", "transferFee", "permanentDelegate", "nonTransferable", "defaultFrozen"];

export function memePassesGates(opts: {
  liquidityUsd?: number | null;
  launchedAt?: Date | null;
  risk?: RiskFlags | null;
  launchBet?: boolean;
}): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const liq = opts.liquidityUsd ?? 0;
  if (liq < MEME_MIN_LIQUIDITY_USD) reasons.push("low_liquidity");
  const age = opts.launchedAt ? Date.now() - opts.launchedAt.getTime() : Number.POSITIVE_INFINITY;
  if (!opts.launchBet && age < MEME_MIN_AGE_MS) reasons.push("too_new");
  const r = opts.risk ?? {};
  if (r.mintAuthorityDisabled === false) reasons.push("mint_authority");
  if (r.freezeAuthorityDisabled === false) reasons.push("freeze_authority");
  if ((r.topHolders ?? 0) > MEME_MAX_TOP_HOLDERS) reasons.push("top_holders");
  if ((r.devBalance ?? 0) > MEME_MAX_DEV_BALANCE) reasons.push("dev_balance");
  if (r.isSus) reasons.push("suspicious");
  const ext = r.token2022Risk ?? [];
  if (ext.some((e) => RISKY_EXTS.includes(e))) reasons.push("token2022");
  return { ok: reasons.length === 0, reasons };
}
