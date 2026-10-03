import { api } from "@/lib/api";
import { LeaderboardRow } from "@/components/social/leaderboard-row";
import { TakeCard, type FeedTake } from "@/components/social/take-card";
import { SegmentedTabsClient } from "./periods";

export default async function TrendingPage({ searchParams }: { searchParams: Promise<{ period?: string; q?: string }> }) {
  const { period: raw, q } = await searchParams;
  const period = raw === "1D" || raw === "1W" || raw === "All" ? raw : "1M";
  let takes: FeedTake[] = [];
  try {
    const qParam = q?.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
    const board = await api<{ takes: FeedTake[] }>(`/v1/leaderboard?period=${period}${qParam}`);
    takes = board.takes ?? [];
  } catch {
    takes = [];
  }
  const query = (q ?? "").trim().toLowerCase();
  if (query) {
    takes = takes.filter((t) =>
      `${t.sentence ?? ""} ${t.author} ${t.holdings.map((h) => h.symbol).join(" ")}`.toLowerCase().includes(query)
    );
  }
  return (
    <div className="space-y-5 pb-10">
      <div>
        <h1 className="display text-[28px] text-ink md:text-[32px]">Trending views</h1>
      </div>
      <SegmentedTabsClient period={period} q={q} />
      <div className="glass-card rounded-[28px] px-4">
        {takes.slice(0, 12).map((t, i) => (
          <LeaderboardRow key={t.id} rank={i + 1} take={t} />
        ))}
      </div>
      <div className="space-y-4">
        {takes.slice(0, 8).map((t) => (
          <TakeCard key={`card-${t.id}`} take={t} />
        ))}
      </div>
    </div>
  );
}
