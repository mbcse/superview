import { breakerOpenProviders } from "./breaker.js";

export type ProviderAlert = { kind: string; detail: string; at: number };

const recent: ProviderAlert[] = [];

export function pushAlert(kind: string, detail: string) {
  recent.push({ kind, detail, at: Date.now() });
  if (recent.length > 40) recent.shift();
}

export function providerAlerts() {
  const open = breakerOpenProviders();
  for (const p of open) pushAlert("breaker_open", p);
  return { open, recent: recent.slice(-20) };
}
