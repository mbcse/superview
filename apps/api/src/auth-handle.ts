export function handleFromPrivyId(privyId: string) {
  const tail = privyId.replace(/[^a-z0-9]/gi, "").slice(-10) || "user";
  return `sv_${tail}`.slice(0, 24);
}
