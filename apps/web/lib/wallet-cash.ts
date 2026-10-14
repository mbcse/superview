export type WalletBalance = {
  chainId: number;
  label: string;
  symbol: string;
  usd: number | null;
  address: string;
  provider: string;
};

export type WalletActivity = {
  id: string;
  what: string;
  amountUsd: number | null;
  chainId: number | null;
  hash: string | null;
  explorer: string | null;
  status: string;
  view: string | null;
};

export type WalletSnapshot = {
  homeCashUsd: number;
  gasSponsored?: boolean;
  liveEnabled?: boolean;
  signer?: "PRIVY" | "MERA" | null;
  wallet?: { id?: string; address?: string; chainId?: number; provider?: string } | null;
  wallets?: Array<{ id?: string; address?: string; chainId?: number; provider?: string }>;
  balances?: WalletBalance[];
  grant?: { expiresAt?: string } | null;
  pending?: Array<{ id: string; status: string; txHash?: string | null }>;
  activity?: WalletActivity[];
};

export function shortAddr(addr?: string | null) {
  if (!addr) return "";
  if (addr.length < 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
