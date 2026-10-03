"use client";

import { useEffect, useMemo, useState } from "react";
import { useQueryState } from "nuqs";
import { ArrowRight } from "@phosphor-icons/react";
import { ComposerEntry } from "@/components/social/composer";
import { TakeCard, type FeedTake } from "@/components/social/take-card";
import { EmptyState } from "@/components/ui/surface";
import { Button } from "@/components/ui/button";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { useAuth } from "@/components/auth-provider";
import { useRouter } from "next/navigation";
import { InvestDialog } from "@/components/social/invest-dialog";
import { cn } from "@/lib/cn";

const TABS = ["For you", "Following", "Trending"] as const;
const TAB_API: Record<(typeof TABS)[number], string> = {
  "For you": "for-you",
  Following: "following",
  Trending: "trending"
};

function initialsOf(name?: string | null) {
  const parts = (name ?? "You").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "Y") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function FeedClient({ initial }: { initial: FeedTake[] }) {
  const fetchApi = useAuthedFetch();
  const { displayName } = useAuth();
  const router = useRouter();
  const [q] = useQueryState("q", { defaultValue: "" });
  const [tab, setTab] = useState<(typeof TABS)[number]>("For you");
  const [takes, setTakes] = useState(initial);
  const [investTake, setInvestTake] = useState<FeedTake | null>(null);
  const firstName = (displayName ?? "").trim().split(/\s+/)[0];

  useEffect(() => {
    const query = q.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
    fetchApi<{ takes: FeedTake[] }>(`/v1/feed?tab=${TAB_API[tab]}${query}`)
      .then((d) => setTakes(d.takes ?? []))
      .catch(() => {});
  }, [fetchApi, tab, q]);

  const visible = useMemo(() => {
    const query = q.toLowerCase();
    return takes.filter((t) => {
      if (!query) return true;
      return `${t.sentence ?? ""} ${t.author} ${t.holdings.map((h) => h.symbol).join(" ")}`.toLowerCase().includes(query);
    });
  }, [takes, q]);

  function followChanged(authorId: string, following: boolean) {
    setTakes((rows) => {
      const next = rows.map((t) => (t.authorId === authorId ? { ...t, following } : t));
      if (tab === "Following" && !following) return next.filter((t) => t.authorId !== authorId);
      return next;
    });
  }

  async function copyView(id: string) {
    try {
      const r = await fetchApi<{ forkTakeId: string }>(`/v1/takes/${id}/fork`, { method: "POST" });
      router.push(`/app/compose?fork=${r.forkTakeId}`);
    } catch {
      router.push(`/app/compose`);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[600px]">
      <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-ink">
        {firstName ? `${greeting()}, ${firstName}` : greeting()}
      </h1>
      <ComposerEntry initials={initialsOf(displayName)} />
      <div className="mt-3 flex gap-5 border-b border-[#e3eaec]" role="tablist">
        {TABS.map((opt) => {
          const on = opt === tab;
          return (
            <button
              key={opt}
              role="tab"
              type="button"
              aria-selected={on}
              className={cn(
                "relative pb-2.5 text-[14px] font-semibold",
                on ? "text-ink" : "text-muted hover:text-ink"
              )}
              onClick={() => setTab(opt)}
            >
              {opt}
              {on ? <span className="absolute inset-x-0 -bottom-px h-0.5 bg-teal" /> : null}
            </button>
          );
        })}
      </div>
      {visible.length ? (
        <ul className="mt-2 space-y-2">
          {visible.map((t) => (
            <li key={t.id}>
              <TakeCard
                take={t}
                onCopy={() => void copyView(t.id)}
                onInvest={() => setInvestTake(t)}
                onFollowChange={followChanged}
              />
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title={tab === "Following" ? "Nobody you follow has posted yet" : "No views yet"}
          body={
            q
              ? "Try another search."
              : tab === "Following"
                ? "Follow people whose views you want to sit with, and they’ll show up here."
                : "Write a view or explore trending."
          }
          action={
            <Button variant="primary" onClick={() => setTab("Trending")}>
              Explore views <ArrowRight size={16} />
            </Button>
          }
        />
      )}
      <InvestDialog takeId={investTake?.id ?? null} sentence={investTake?.sentence} onClose={() => setInvestTake(null)} />
    </div>
  );
}
