export function isHexAddress(value: string) {
  return /^0x[0-9a-fA-F]{40}$/.test(value);
}

export function assertWalletAssignable(
  existing: { userId: string; privyWalletId?: string | null } | null,
  userId: string,
  verifiedPrivyWalletId: string
) {
  if (!existing) return { ok: true as const };
  if (existing.userId !== userId) return { ok: false as const, error: "wallet_bound" as const };
  if (existing.privyWalletId && existing.privyWalletId !== verifiedPrivyWalletId) {
    return { ok: false as const, error: "wallet_mismatch" as const };
  }
  return { ok: true as const };
}

/** Client-supplied Privy wallet ids are ignored. Only a server lookup may bind. */
export function verifiedWalletId(lookedUp?: string | null, _clientSupplied?: string | null) {
  void _clientSupplied;
  return lookedUp || undefined;
}

export function liveGrantContracts(requested: unknown, envAllow: string, usdg: string) {
  const allow = new Set<string>([usdg.toLowerCase()]);
  for (const part of envAllow.split(/[\s,]+/)) {
    if (isHexAddress(part)) allow.add(part.toLowerCase());
  }
  const asked = Array.isArray(requested) ? requested : [];
  const out = new Set<string>();
  for (const c of asked) {
    const n = String(c).toLowerCase();
    if (allow.has(n)) out.add(n);
  }
  for (const c of allow) out.add(c);
  return [...out];
}

export function grantAllows(allowedContracts: unknown, address?: string | null) {
  if (!address || !isHexAddress(address)) return false;
  const set = new Set(
    (Array.isArray(allowedContracts) ? allowedContracts : []).map((c) => String(c).toLowerCase())
  );
  return set.has(address.toLowerCase());
}
