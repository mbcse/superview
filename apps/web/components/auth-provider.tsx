"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { API_ORIGIN } from "../lib/fmt";
import { disconnectMera, loginWithMera, meraToken, setMeraToken } from "../lib/mera";

export type Session = {
  ready: boolean;
  authenticated: boolean;
  displayName: string;
  handle: string;
  walletAddress: string | null;
  authProvider: "PRIVY" | "MERA" | "DEMO" | null;
  login: () => Promise<void>;
  loginMera: () => Promise<void>;
  logout: () => Promise<void>;
  getHeaders: () => Promise<Record<string, string>>;
};

type MeUser = {
  id?: string;
  handle?: string;
  displayName?: string;
  authProvider?: "PRIVY" | "MERA" | "DEMO";
  wallets?: Array<{ address?: string; isPrimary?: boolean; provider?: string }>;
};

const Ctx = createContext<Session | null>(null);
const DEMO_KEY = "superview-demo-user";

async function loadMeraUser(): Promise<MeUser | null> {
  const token = meraToken();
  if (!token) return null;
  const res = await fetch(`${API_ORIGIN}/v1/me`, {
    headers: { authorization: `Bearer ${token}` },
    cache: "no-store"
  });
  if (!res.ok) {
    setMeraToken(null);
    return null;
  }
  const body = (await res.json()) as { user?: MeUser };
  return body.user ?? null;
}

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState<string | null>(null);
  const [meraUser, setMeraUser] = useState<MeUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDemo(window.localStorage.getItem(DEMO_KEY));
    void loadMeraUser()
      .then(setMeraUser)
      .finally(() => setReady(true));
  }, []);

  const login = useCallback(async () => {
    window.localStorage.setItem(DEMO_KEY, "demo");
    setDemo("demo");
  }, []);

  const loginMera = useCallback(async () => {
    await loginWithMera();
    setMeraUser(await loadMeraUser());
  }, []);

  const logout = useCallback(async () => {
    window.localStorage.removeItem(DEMO_KEY);
    disconnectMera();
    setDemo(null);
    setMeraUser(null);
  }, []);

  const getHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {};
    const mera = meraToken();
    if (mera) headers.authorization = `Bearer ${mera}`;
    if (demo) headers["x-demo-user"] = demo;
    return headers;
  }, [demo]);

  const value = useMemo<Session>(
    () => ({
      ready,
      authenticated: Boolean(meraUser || demo),
      displayName: meraUser?.displayName ?? (demo ? "Maya Chen" : "Guest"),
      handle: meraUser?.handle ?? demo ?? "guest",
      walletAddress: meraUser?.wallets?.find((w) => w.isPrimary)?.address ?? meraUser?.wallets?.[0]?.address ?? null,
      authProvider: meraUser?.authProvider ?? (demo ? "DEMO" : null),
      login,
      loginMera,
      logout,
      getHeaders
    }),
    [ready, demo, meraUser, login, loginMera, logout, getHeaders]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function PrivyAuthProvider({ children }: { children: ReactNode }) {
  const privy = usePrivy();
  const [meraUser, setMeraUser] = useState<MeUser | null>(null);
  const [meraReady, setMeraReady] = useState(false);

  useEffect(() => {
    void loadMeraUser()
      .then(setMeraUser)
      .finally(() => setMeraReady(true));
  }, []);

  const login = useCallback(async () => {
    await privy.login();
  }, [privy]);

  const loginMera = useCallback(async () => {
    await loginWithMera();
    setMeraUser(await loadMeraUser());
  }, []);

  const logout = useCallback(async () => {
    disconnectMera();
    setMeraUser(null);
    await privy.logout();
  }, [privy]);

  const getHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {};
    const mera = meraToken();
    if (mera) headers.authorization = `Bearer ${mera}`;
    const token = await privy.getAccessToken().catch(() => null);
    if (!mera && token) headers.authorization = `Bearer ${token}`;
    if (process.env.NODE_ENV !== "production") headers["x-demo-user"] = "demo";
    return headers;
  }, [privy]);

  useEffect(() => {
    if (!privy.ready || !privy.authenticated || meraToken()) return;
    void (async () => {
      const token = await privy.getAccessToken();
      if (!token) return;
      await fetch(`${API_ORIGIN}/v1/me/sync`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({
          displayName: privy.user?.email?.address ?? privy.user?.google?.email ?? "Member",
          walletAddress: privy.user?.wallet?.address
        })
      }).catch(() => {});
    })();
  }, [privy.ready, privy.authenticated, privy]);

  const value = useMemo<Session>(
    () => ({
      ready: privy.ready && meraReady,
      authenticated: Boolean(meraUser) || privy.authenticated,
      displayName:
        meraUser?.displayName ?? privy.user?.email?.address ?? privy.user?.google?.email ?? "Member",
      handle: meraUser?.handle ?? "member",
      walletAddress:
        meraUser?.wallets?.find((w) => w.isPrimary)?.address ??
        meraUser?.wallets?.[0]?.address ??
        privy.user?.wallet?.address ??
        null,
      authProvider: meraUser?.authProvider ?? (privy.authenticated ? "PRIVY" : null),
      login,
      loginMera,
      logout,
      getHeaders
    }),
    [privy.ready, privy.authenticated, privy.user, meraUser, meraReady, login, loginMera, logout, getHeaders]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within an auth provider");
  return ctx;
}
