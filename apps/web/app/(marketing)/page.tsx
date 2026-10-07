import Link from "next/link";
import dynamic from "next/dynamic";
import { MarketingChrome } from "@/components/marketing/chrome";
import { HeroDemo } from "@/components/marketing/hero-demo";
import { TakeCard, type FeedTake } from "@/components/social/take-card";
import { LeaderboardRow } from "@/components/social/leaderboard-row";
import { api } from "@/lib/api";

const LandingStory = dynamic(
  () => import("@/components/marketing/landing-story").then((m) => m.LandingStory),
  {
    loading: () => (
      <div className="mx-auto w-[min(1080px,calc(100%-24px))] py-24">
        <div className="h-[400px] rounded-2xl border border-teal/14 bg-white/50" />
      </div>
    )
  }
);

export default async function LandingPage() {
  let takes: FeedTake[] = [];
  try {
    const feed = await api<{ takes: FeedTake[] }>("/v1/feed?tab=trending");
    takes = feed.takes ?? [];
  } catch {
    takes = [];
  }
  const trending = takes.slice(0, 4);
  const board = takes.slice(0, 6);

  return (
    <main className="page-canvas">
      <section className="mx-auto w-[min(1080px,calc(100%-16px))] pt-3">
        <MarketingChrome />
        <div className="mx-auto max-w-[880px] px-2 pb-16 pt-8 md:pt-12">
          <h1 className="display max-w-[18ch] text-[clamp(36px,5.6vw,56px)]">
            Say what you believe about the world. Watch it play out.
          </h1>
          <p className="mt-4 max-w-[30rem] text-[17px] leading-relaxed text-muted">
            Write a view. SuperView sizes a basket of stock tokens or memecoins. Paper uses live markets without live money.
          </p>
          <div className="mt-7">
            <HeroDemo />
          </div>
        </div>
      </section>

      <LandingStory />

      <section id="views" className="mx-auto w-[min(1080px,calc(100%-24px))] scroll-mt-24 pb-16">
        <h2 className="display px-2 text-[28px] text-ink md:text-[32px]">Trending views</h2>
        <p className="mt-3 max-w-[36rem] px-2 text-[16px] leading-relaxed text-muted">
          Live from the feed. Copy a view, comment, or put paper behind one you believe.
        </p>
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {trending.map((t) => (
            <TakeCard key={t.id} take={t} />
          ))}
          {!trending.length ? <p className="px-2 text-muted">The feed fills as views publish.</p> : null}
        </div>
        {trending.length ? (
          <Link className="mt-5 inline-flex px-2 text-[14px] text-teal hover:text-ink" href="/explore">
            All trending views
          </Link>
        ) : null}
      </section>

      <section className="mx-auto w-[min(720px,calc(100%-24px))] pb-16">
        <div className="flex items-end justify-between">
          <h2 className="display text-[28px] text-ink md:text-[32px]">Leaderboard</h2>
          <Link className="text-[14px] text-muted hover:text-ink" href="/explore">
            All
          </Link>
        </div>
        <div className="glass-card mt-4 rounded-[28px] px-4">
          {board.map((t, i) => (
            <LeaderboardRow key={t.id} rank={i + 1} take={t} />
          ))}
          {!board.length ? <p className="px-4 py-6 text-muted">Ranks appear as views post vs S&P marks.</p> : null}
        </div>
      </section>
    </main>
  );
}
