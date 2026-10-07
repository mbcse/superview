type State = { fails: number; openUntil: number };

const states = new Map<string, State>();

export function breakerOk(provider: string): boolean {
  const s = states.get(provider);
  if (!s) return true;
  if (s.openUntil && Date.now() < s.openUntil) return false;
  return true;
}

export function breakerSuccess(provider: string) {
  states.set(provider, { fails: 0, openUntil: 0 });
}

export function breakerFail(provider: string, resetAt?: number) {
  const s = states.get(provider) ?? { fails: 0, openUntil: 0 };
  s.fails += 1;
  const cooldown = resetAt && resetAt > Date.now() ? resetAt : Date.now() + Math.min(60_000, 2_000 * 2 ** Math.min(s.fails, 5));
  if (s.fails >= 3) s.openUntil = cooldown;
  states.set(provider, s);
}

export function breakerOpenProviders(): string[] {
  const now = Date.now();
  return [...states.entries()].filter(([, s]) => s.openUntil > now).map(([k]) => k);
}
