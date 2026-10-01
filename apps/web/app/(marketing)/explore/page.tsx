import { api } from "@/lib/api";
import Link from "next/link";
import { MarketingChrome } from "@/components/marketing/chrome";
import { LeaderboardRow } from "@/components/social/leaderboard-row";
import type { FeedTake } from "@/components/social/take-card";

export default async function ExplorePage({
  searchParams
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period: raw } = await searchParams;
  const period = raw === "1D" || raw === "1W" || raw === "All" ? raw : "1M";
  let takes: FeedTake[] = [];
  try {
    const feed = await api<{ takes: FeedTake[] }>(`/v1/leaderboard?period=${period}`);
    takes = feed.takes ?? [];
  } catch {
    takes = [];
  }

  return (
    <>
      <MarketingChrome />
      <main className="mx-auto w-[min(720px,calc(100%-24px))] py-16">
        <h1 className="display text-[32px] text-ink md:text-[40px]">Trending views</h1>
        <p className="mt-3 text-[16px] text-muted">Public views, ranked vs S&P 500.</p>
        <div className="mt-6 flex gap-2 text-[13px]">
          {(["1D", "1W", "1M", "All"] as const).map((p) => (
            <Link
              key={p}
              href={`/explore?period=${p}`}
              className={`rounded-full px-3 py-1.5 ${p === period ? "bg-lagoon text-white" : "bg-mist text-muted"}`}
            >
              {p}
            </Link>
          ))}
        </div>
        <div className="glass-card mt-6 rounded-[28px] px-4">
          {takes.map((t, i) => (
            <LeaderboardRow key={t.id} rank={i + 1} take={t} />
          ))}
        </div>
      </main>
    </>
  );
}
