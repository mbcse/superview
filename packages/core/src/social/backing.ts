import { asNum } from "../portfolio/mark.js";

export type BackingPrivacyRow = {
  userId: string;
  level: string;
  amountUsd?: unknown;
  revealAmount?: boolean;
};

function isInvested(level: string) {
  return level === "DRY_RUN" || level === "LIVE";
}

export function publicInvestedUsd(backings: BackingPrivacyRow[]) {
  let sum = 0;
  let any = false;
  for (const b of backings) {
    if (!isInvested(b.level) || !b.revealAmount) continue;
    const n = asNum(b.amountUsd);
    if (n == null) continue;
    sum += n;
    any = true;
  }
  return any ? sum : null;
}

export function backingPrivacy(backings: BackingPrivacyRow[], viewerId?: string | null) {
  const invested = backings.filter((b) => isInvested(b.level));
  const mine = viewerId ? invested.find((b) => b.userId === viewerId) : undefined;
  return {
    publicInvestedUsd: publicInvestedUsd(backings),
    backers: invested.length,
    myInvestedUsd: mine ? asNum(mine.amountUsd) : null,
    myRevealAmount: mine ? Boolean(mine.revealAmount) : null
  };
}

export function sanitizeBacking(
  b: BackingPrivacyRow & Record<string, unknown>,
  viewerId?: string | null
) {
  const mine = Boolean(viewerId && b.userId === viewerId);
  const reveal = Boolean(b.revealAmount);
  return {
    id: b.id,
    level: b.level,
    revealAmount: mine ? reveal : reveal,
    amountUsd: mine || reveal ? asNum(b.amountUsd) : null,
    userId: mine ? b.userId : undefined
  };
}
