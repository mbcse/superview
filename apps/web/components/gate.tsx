"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./auth-provider";
import { loginHref } from "../lib/auth-paths";

export function Gate({ children }: { children: ReactNode }) {
  const { ready, authenticated } = useAuth();
  const path = usePathname();
  const router = useRouter();

  const paperLocal = process.env.NODE_ENV !== "production";

  useEffect(() => {
    if (ready && !authenticated && !paperLocal) router.replace(loginHref(path));
  }, [ready, authenticated, path, router, paperLocal]);

  if (!ready) return <p className="p-8 text-muted">Loading session…</p>;
  if (!authenticated && !paperLocal) return <p className="p-8 text-muted">Redirecting to log in…</p>;
  return <>{children}</>;
}
