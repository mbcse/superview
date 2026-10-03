"use client";

import { useEffect, useState } from "react";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/cn";

export function FollowButton({
  authorId,
  following,
  onChange,
  className
}: {
  authorId: string;
  following?: boolean;
  onChange?: (next: boolean) => void;
  className?: string;
}) {
  const fetchApi = useAuthedFetch();
  const { authenticated, login } = useAuth();
  const [on, setOn] = useState(Boolean(following));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOn(Boolean(following));
  }, [following]);

  async function toggle() {
    if (busy) return;
    const next = !on;
    setOn(next);
    setBusy(true);
    try {
      await fetchApi(`/v1/users/${authorId}/follow`, { method: next ? "POST" : "DELETE" });
      onChange?.(next);
    } catch {
      setOn(!next);
      if (!authenticated) await login();
    }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={busy}
      aria-pressed={on}
      className={cn(
        "inline-flex min-h-8 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold transition-[background-color,color,border-color,transform] duration-150 ease-out enabled:active:scale-[0.97]",
        on
          ? "border border-teal/15 bg-mist text-ink hover:bg-white"
          : "border border-teal/25 bg-white/50 text-teal hover:border-teal/50 hover:bg-teal hover:text-white",
        className
      )}
    >
      {on ? "Following" : "Follow"}
    </button>
  );
}
