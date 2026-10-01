export type LiveQuote = {
  symbol: string;
  last: number;
  tokenLast?: number | null;
  bid: number | null;
  ask: number | null;
  halt: boolean;
  chgPct?: number | null;
  dir?: "up" | "down" | null;
  seq?: number;
};

export function mergeQuote(prev: LiveQuote | undefined, next: LiveQuote): { quote: LiveQuote; changed: boolean } {
  if (next.last == null || Number.isNaN(next.last)) {
    return { quote: prev ?? next, changed: false };
  }
  if (!prev) return { quote: { ...next, dir: null, seq: 1 }, changed: true };
  const lastChanged = prev.last !== next.last;
  const chgChanged = prev.chgPct !== next.chgPct;
  const bookChanged = prev.bid !== next.bid || prev.ask !== next.ask;
  if (!lastChanged && !chgChanged && !bookChanged) return { quote: prev, changed: false };
  const dir = lastChanged ? (next.last > prev.last ? "up" : "down") : (prev.dir ?? null);
  return { quote: { ...next, dir, seq: (prev.seq ?? 0) + 1 }, changed: true };
}

type Listener = () => void;

let snapshot: Record<string, LiveQuote> = {};
const all = new Set<Listener>();
const bySymbol = new Map<string, Set<Listener>>();
const wanted = new Set<string>(["SPY", "RHSPY"]);
const wantedListeners = new Set<Listener>();

function keysFor(symbol: string) {
  const u = symbol.toUpperCase();
  const bare = u.replace(/^RH/, "");
  return [...new Set([u, bare, bare ? `RH${bare}` : ""].filter(Boolean))];
}

function notify(keys: string[]) {
  for (const key of keys) bySymbol.get(key)?.forEach((fn) => fn());
  all.forEach((fn) => fn());
}

export function watchSymbol(symbol: string) {
  const before = wanted.size;
  for (const key of keysFor(symbol)) wanted.add(key);
  if (wanted.size !== before) wantedListeners.forEach((fn) => fn());
}

export function wantedSymbols() {
  return [...wanted];
}

export function onWanted(fn: Listener) {
  wantedListeners.add(fn);
  return () => wantedListeners.delete(fn);
}

export function getQuote(symbol?: string | null): LiveQuote | null {
  if (!symbol) return null;
  const u = symbol.toUpperCase();
  const bare = u.replace(/^RH/, "");
  return snapshot[u] ?? snapshot[`RH${bare}`] ?? snapshot[bare] ?? null;
}

export function getQuoteBook() {
  return snapshot;
}

export function subscribeAll(fn: Listener) {
  all.add(fn);
  return () => all.delete(fn);
}

export function subscribeSymbol(symbol: string, fn: Listener) {
  const keys = keysFor(symbol);
  for (const key of keys) {
    const set = bySymbol.get(key) ?? new Set();
    set.add(fn);
    bySymbol.set(key, set);
  }
  return () => {
    for (const key of keys) {
      const set = bySymbol.get(key);
      set?.delete(fn);
    }
  };
}

export function applyQuotes(list: LiveQuote[]) {
  if (!list.length) return;
  let next: Record<string, LiveQuote> | null = null;
  const dirty = new Set<string>();
  for (const raw of list) {
    const u = raw.symbol.toUpperCase();
    const bare = u.replace(/^RH/, "");
    const merged = mergeQuote(snapshot[u] ?? snapshot[bare], { ...raw, symbol: u });
    if (!merged.changed) continue;
    if (!next) next = { ...snapshot };
    next[u] = merged.quote;
    if (bare) next[bare] = { ...merged.quote, symbol: bare };
    dirty.add(u);
    if (bare) dirty.add(bare);
  }
  if (!next) return;
  snapshot = next;
  notify([...dirty]);
}

let raf = 0;
const pending: LiveQuote[] = [];

export function enqueueQuotes(list: LiveQuote[]) {
  pending.push(...list);
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    const batch = pending.splice(0, pending.length);
    applyQuotes(batch);
  });
}
