import Link from "next/link";
import { MarketingChrome } from "@/components/marketing/chrome";
import { LandingComposer } from "@/components/marketing/landing-composer";
import { TakeCard, type FeedTake } from "@/components/social/take-card";
import { LeaderboardRow } from "@/components/social/leaderboard-row";
import { api } from "@/lib/api";

export default async function LandingPage() {
  let takes: FeedTake[] = [];
  try {
    const feed = await api<{ takes: FeedTake[] }>("/v1/feed?tab=trending");
    takes = feed.takes ?? [];
  } catch {
    takes = [];
  }
  const trending = takes.slice(0, 6);
  const board = takes.slice(0, 8);

  return (
    <main className="page-canvas">
      <section className="mx-auto w-[min(1080px,calc(100%-16px))] pt-3">
        <MarketingChrome />
        <div className="mx-auto max-w-[720px] px-2 pb-16 pt-10 md:pt-16">
          <div className="mb-5 flex items-center gap-2 text-[11px] uppercase tracking-[0.08em] text-teal">
            <span className="size-1.5 rounded-full bg-aqua" /> A new way to invest
          </div>
          <h1 className="display text-[clamp(36px,6vw,60px)]">
            Say what you believe about the world. Watch it play out.
          </h1>
          <p className="mt-5 max-w-[32rem] text-[17px] leading-relaxed text-muted">
            Write a view. SuperView researches Robinhood Chain tokenized stocks and sizes a basket. Paper is live markets without live money.
          </p>
          <div className="mt-8">
            <LandingComposer />
          </div>
        </div>
      </section>
      <section className="mx-auto w-[min(1080px,calc(100%-24px))] pb-16" id="how">
        <h2 className="display px-2 text-[22px] text-ink">Trending views</h2>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {trending.map((t) => (
            <TakeCard key={t.id} take={t} />
          ))}
          {!trending.length ? <p className="px-2 text-muted">The feed fills as views publish.</p> : null}
        </div>
      </section>
      <section className="mx-auto w-[min(720px,calc(100%-24px))] pb-20">
        <div className="flex items-end justify-between">
          <h2 className="display text-[22px] text-ink">Leaderboard</h2>
          <Link className="text-[14px] text-muted hover:text-ink" href="/explore">
            All
          </Link>
        </div>
        <div className="glass-card mt-4 rounded-[28px] px-4">
          {board.map((t, i) => (
            <LeaderboardRow key={t.id} rank={i + 1} take={t} />
          ))}
        </div>
      </section>
    </main>
  );
}
