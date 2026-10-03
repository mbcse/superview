"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { API_ORIGIN } from "../lib/fmt";

export type Session = {
  ready: boolean;
  authenticated: boolean;
  displayName: string;
  handle: string;
  walletAddress: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  getHeaders: () => Promise<Record<string, string>>;
};

const Ctx = createContext<Session | null>(null);
const DEMO_KEY = "superview-demo-user";

export function DemoAuthProvider({ children }: { children: ReactNode }) {
  const [demo, setDemo] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setDemo(window.localStorage.getItem(DEMO_KEY));
    setReady(true);
  }, []);

  const login = useCallback(async () => {
    window.localStorage.setItem(DEMO_KEY, "demo");
    setDemo("demo");
  }, []);

  const logout = useCallback(async () => {
    window.localStorage.removeItem(DEMO_KEY);
    setDemo(null);
  }, []);

  const getHeaders = useCallback(async (): Promise<Record<string, string>> => (demo ? { "x-demo-user": demo } : {}), [demo]);

  const value = useMemo<Session>(
    () => ({
      ready,
      authenticated: Boolean(demo),
      displayName: demo ? "Maya Chen" : "Guest",
      handle: demo ?? "guest",
      walletAddress: null,
      login,
      logout,
      getHeaders
    }),
    [ready, demo, login, logout, getHeaders]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function PrivyAuthProvider({ children }: { children: ReactNode }) {
  const privy = usePrivy();

  const login = useCallback(async () => {
    await privy.login();
  }, [privy]);

  const logout = useCallback(async () => {
    await privy.logout();
  }, [privy]);

  const getHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = {};
    const token = await privy.getAccessToken().catch(() => null);
    if (token) headers.authorization = `Bearer ${token}`;
    if (process.env.NODE_ENV !== "production") headers["x-demo-user"] = "demo";
    return headers;
  }, [privy]);

  useEffect(() => {
    if (!privy.ready || !privy.authenticated) return;
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
      ready: privy.ready,
      authenticated: privy.authenticated,
      displayName: privy.user?.email?.address ?? privy.user?.google?.email ?? "Member",
      handle: "member",
      walletAddress: privy.user?.wallet?.address ?? null,
      login,
      logout,
      getHeaders
    }),
    [privy.ready, privy.authenticated, privy.user, login, logout, getHeaders]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within an auth provider");
  return ctx;
}
