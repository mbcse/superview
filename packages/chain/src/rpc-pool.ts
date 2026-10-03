import { fallback, http, type Transport } from "viem";
import { ROBINHOOD_CHAIN_ID } from "./constants.js";

export const CHAINLIST_RPCS_URL = "https://chainlist.org/rpcs.json";

/** Public, keyless Robinhood Chain (4663) endpoints. Official first. */
export const DEFAULT_RH_RPCS = [
  "https://rpc.mainnet.chain.robinhood.com",
  "https://sequencer.mainnet.chain.robinhood.com",
  "https://triport.io/rpc/robinhood/public"
] as const;

const KEY_PLACEHOLDER = /\$\{|API_KEY|YOUR-|<|>/i;
const deadUntil = new Map<string, number>();
let rotate = 0;
let chainlist: string[] = [];
let chainlistAt = 0;
const CHAINLIST_TTL_MS = 6 * 60 * 60 * 1000;

export function isUsableHttpRpc(url: string): boolean {
  if (!/^https:\/\//i.test(url)) return false;
  if (KEY_PLACEHOLDER.test(url)) return false;
  return true;
}

export function splitRpcUrls(value?: string | readonly string[] | null): string[] {
  if (!value) return [];
  const parts = Array.isArray(value) ? value : String(value).split(/[\s,]+/);
  return [...new Set(parts.map((u) => u.trim()).filter(isUsableHttpRpc))];
}

type ChainlistRpc = string | { url?: string };
type ChainlistChain = { chainId?: number; rpc?: ChainlistRpc[] };

export function parseChainlistRpcs(payload: unknown, chainId = ROBINHOOD_CHAIN_ID): string[] {
  if (!Array.isArray(payload)) return [];
  const chain = payload.find((row) => row && typeof row === "object" && (row as ChainlistChain).chainId === chainId) as
    | ChainlistChain
    | undefined;
  const urls: string[] = [];
  for (const rpc of chain?.rpc ?? []) {
    const url = typeof rpc === "string" ? rpc : rpc?.url;
    if (url && isUsableHttpRpc(url)) urls.push(url);
  }
  return [...new Set(urls)];
}

export function envRpcUrls(source: NodeJS.ProcessEnv = process.env): string[] {
  return splitRpcUrls([source.ALCHEMY_RPC_URL ?? "", source.ROBINHOOD_RPC_URL ?? "", source.ROBINHOOD_RPC_URLS ?? ""]);
}

export function mergeRhRpcUrls(preferred?: string | readonly string[] | null, extras: string[] = chainlist): string[] {
  const urls = [...splitRpcUrls(preferred), ...envRpcUrls(), ...extras, ...DEFAULT_RH_RPCS];
  return [...new Set(urls.filter(isUsableHttpRpc))];
}

export function markRpcFailed(url: string, status?: number) {
  const ms = status === 429 || status === 503 ? 60_000 : 15_000;
  deadUntil.set(url, Date.now() + ms);
}

export function orderedRpcUrls(urls: string[], now = Date.now()): string[] {
  const live: string[] = [];
  const cooling: string[] = [];
  for (const url of urls) {
    if ((deadUntil.get(url) ?? 0) > now) cooling.push(url);
    else live.push(url);
  }
  if (!live.length) return urls;
  const start = rotate++ % live.length;
  return [...live.slice(start), ...live.slice(0, start), ...cooling];
}

export function createRhTransport(preferred?: string | readonly string[] | null): Transport {
  const urls = orderedRpcUrls(mergeRhRpcUrls(preferred));
  return fallback(
    urls.map((url) =>
      http(url, {
        timeout: 6_000,
        retryCount: 0,
        fetchOptions: { signal: undefined }
      })
    ),
    { retryCount: 1, rank: true }
  );
}

export async function refreshChainlistRpcs(chainId = ROBINHOOD_CHAIN_ID): Promise<string[]> {
  if (Date.now() - chainlistAt < CHAINLIST_TTL_MS && chainlist.length) return chainlist;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8_000);
  try {
    const res = await fetch(CHAINLIST_RPCS_URL, { signal: ctrl.signal, headers: { accept: "application/json" } });
    if (!res.ok) return chainlist;
    const parsed = parseChainlistRpcs(await res.json(), chainId);
    if (parsed.length) {
      chainlist = parsed;
      chainlistAt = Date.now();
    }
  } catch {
    /* keep last good list */
  } finally {
    clearTimeout(timer);
  }
  return chainlist;
}
