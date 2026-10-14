"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth } from "@/components/auth-provider";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import type { WalletSnapshot } from "@/lib/wallet-cash";

const Ctx = createContext<{
  wallet: WalletSnapshot | null;
  refresh: () => Promise<void>;
}>({ wallet: null, refresh: async () => {} });

export function WalletCashProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated } = useAuth();
  const fetchApi = useAuthedFetch();
  const [wallet, setWallet] = useState<WalletSnapshot | null>(null);

  const refresh = useCallback(async () => {
    if (!authenticated) {
      setWallet(null);
      return;
    }
    try {
      const next = await fetchApi<WalletSnapshot>("/v1/wallet");
      setWallet(next);
    } catch {
      setWallet(null);
    }
  }, [authenticated, fetchApi]);

  useEffect(() => {
    if (!ready) return;
    void refresh();
    const id = window.setInterval(() => void refresh(), 15_000);
    return () => window.clearInterval(id);
  }, [ready, refresh]);

  const value = useMemo(() => ({ wallet, refresh }), [wallet, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWalletCash() {
  return useContext(Ctx);
}
