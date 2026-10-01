"use client";

import { useCallback } from "react";
import { useAuth } from "./auth-provider";
import { API_ORIGIN } from "../lib/fmt";
import { ApiError } from "../lib/api";

export function useAuthedFetch() {
  const { getHeaders } = useAuth();
  return useCallback(
    async function authedFetch<T>(path: string, init?: RequestInit): Promise<T> {
      const auth = await getHeaders();
      const headers = new Headers(init?.headers);
      Object.entries(auth).forEach(([k, v]) => headers.set(k, String(v)));
      if (init?.body && !headers.has("content-type")) headers.set("content-type", "application/json");
      const res = await fetch(`${API_ORIGIN}${path}`, { ...init, headers, cache: "no-store" });
      if (!res.ok) throw new ApiError(res.status, await res.text());
      return (await res.json()) as T;
    },
    [getHeaders]
  );
}
