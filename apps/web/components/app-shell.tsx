"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { House, TrendUp, Plus, ChartPie, User, Bell, MagnifyingGlass, Pulse } from "@phosphor-icons/react";
import { useAuth } from "./auth-provider";
import { Input } from "./ui/input";
import { Wordmark } from "./brand";
import { AgentOrb } from "./glass/agent-orb";
import { API_ORIGIN } from "@/lib/fmt";
import { fmtVsLabel, useLiveVsSpy } from "@/lib/live-vs";
import { LivePrice } from "./social/live-price";
import { TickValue } from "@/components/data/tick-value";
import { SegmentedTabs } from "@/components/data/segmented-tabs";
import type { FeedTake } from "./social/take-card";
import { useLiveQuote } from "./social/price-stream";
import { useStockSheet } from "./social/stock-sheet";
import { useQueryState } from "nuqs";
import { useWorld } from "@/lib/world";

const EASE = [0.23, 1, 0.32, 1] as const;
const STOCK_MOVERS = ["NVDA", "AAPL", "TSLA", "MSFT", "AMZN", "META"] as const;

function initialsOf(name?: string | null) {
  const parts = (name ?? "You").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "Y") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function pad2(n: number) {
  return n.toString().padStart(2, "0");
}

function cashSessionOpen(d = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/New_York",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false
    })
      .formatToParts(d)
      .map((p) => [p.type, p.value])
  );
  if (parts.weekday === "Sat" || parts.weekday === "Sun") return false;
  const hm = Number(parts.hour) * 60 + Number(parts.minute);
  return hm >= 9 * 60 + 30 && hm < 16 * 60;
}

function MarketStatus() {
  const { world } = useWorld();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const tick = () => setOpen(cashSessionOpen());
    tick();
    const id = window.setInterval(tick, 30_000);
    return () => window.clearInterval(id);
  }, []);
  const live = world === "MEMES" || open;
  return (
    <p className="mt-10 flex items-center gap-2 px-4 text-[11px] uppercase tracking-[0.08em] text-muted">
      <span className="relative flex h-2 w-2">
        {live ? <span className="absolute inset-0 animate-ping rounded-full bg-aqua/60" /> : null}
        <span className={`relative h-2 w-2 rounded-full ${live ? "bg-aqua" : "bg-muted"}`} />
      </span>
      {world === "MEMES" ? "24/7" : open ? "Market open" : "After hours"}
    </p>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const flow = path.startsWith("/app/compose");

  if (flow) {
    return <>{children}</>;
  }

  return (
      <div className="min-h-screen w-full text-ink">
        <ShellHeader />
        <div className="mx-auto flex max-w-[1320px] gap-8 px-4 pb-32 pt-6 md:px-6 lg:pb-16">
          <NavRail className="sticky top-[92px] hidden w-[208px] shrink-0 self-start lg:block" />
          <main id="main" className="mx-auto w-full min-w-0 max-w-[680px] flex-1">
            {children}
          </main>
          <PulseRail className="sticky top-[92px] hidden w-[300px] shrink-0 self-start min-[1100px]:block" />
        </div>
        <BottomNav className="lg:hidden" />
      </div>
  );
}

function ShellHeader() {
  const { displayName } = useAuth();
  const [q, setQ] = useQueryState("q", { defaultValue: "" });
  const [search, setSearch] = useState(q);
  const router = useRouter();

  return (
    <header className="shell-header sticky top-0 z-30 px-3 pt-3 md:px-6">
      <div className="glass-chrome mx-auto flex h-14 max-w-[1320px] items-center gap-3 rounded-2xl px-4 md:px-5">
        <Wordmark href="/app" />
        <form
          role="search"
          className="mx-auto hidden w-full max-w-md sm:block"
          onSubmit={(e) => {
            e.preventDefault();
            void setQ(search.trim());
            router.push(`/app?q=${encodeURIComponent(search.trim())}`);
          }}
        >
          <label htmlFor="global-search" className="sr-only">
            Search views and tickers
          </label>
          <div className="flex h-9 items-center gap-2 rounded-full border border-teal/10 bg-mist/70 px-3.5 focus-within:border-teal/30 focus-within:bg-glass">
            <MagnifyingGlass size={16} className="shrink-0 text-muted" />
            <Input
              id="global-search"
              aria-label="Search views"
              placeholder="Search views and tickers"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-9 min-h-0 border-0 bg-transparent p-0 text-[13px] shadow-none focus:ring-0"
            />
          </div>
        </form>
        <div className="ml-auto flex items-center gap-1 sm:ml-0">
          <Link
            href="/app/trending"
            aria-label="Search"
            className="flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-mist hover:text-ink sm:hidden"
          >
            <MagnifyingGlass size={18} />
          </Link>
          <Link
            href="/app/notifications"
            aria-label="Notifications"
            className="relative flex h-9 w-9 items-center justify-center rounded-full text-muted transition-colors duration-150 hover:bg-mist hover:text-ink"
          >
            <Bell size={18} />
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-aqua ring-2 ring-glass" aria-hidden="true" />
          </Link>
          <Link
            href="/app/profile"
            aria-label="Your profile"
            className="ml-1 flex size-8 items-center justify-center rounded-full bg-mist text-[11px] font-semibold text-teal"
          >
            {initialsOf(displayName)}
          </Link>
        </div>
      </div>
    </header>
  );
}

function RailLink({
  href,
  label,
  icon: Icon,
  exact
}: {
  href: string;
  label: string;
  icon: typeof House;
  exact?: boolean;
}) {
  const path = usePathname();
  const on = exact ? path === href : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`relative flex h-11 items-center gap-3 rounded-2xl px-4 text-[14px] font-medium transition-colors duration-150 ${
        on ? "text-ink" : "text-muted hover:text-ink"
      }`}
    >
      {on ? (
        <motion.span
          layoutId="rail-pill"
          className="absolute inset-0 rounded-2xl bg-glass shadow-[0_8px_30px_-18px_rgba(14,116,144,0.2)]"
          transition={{ type: "tween", duration: 0.22, ease: EASE }}
        />
      ) : null}
      <Icon className={`relative ${on ? "text-teal" : ""}`} size={18} weight={on ? "fill" : "regular"} />
      <span className="relative">{label}</span>
    </Link>
  );
}

function NavRail({ className = "" }: { className?: string }) {
  const { world, setWorld } = useWorld();
  return (
    <nav aria-label="App" className={className}>
      <div className="mb-4">
        <SegmentedTabs
          grow
          size="sm"
          layoutId="rail-world"
          options={["Stocks", "Memes"]}
          value={world === "MEMES" ? "Memes" : "Stocks"}
          onChange={(v) => setWorld(v === "Memes" ? "MEMES" : "STOCKS")}
        />
      </div>
      <div className="flex flex-col gap-1">
        <RailLink href="/app" label="Home" icon={House} exact />
        <RailLink href="/app/trending" label="Trending" icon={TrendUp} />
        <RailLink href="/app/compose" label="New view" icon={Plus} />
        <RailLink href="/app/pockets" label="Portfolio" icon={ChartPie} />
        <RailLink href="/app/profile" label="Profile" icon={User} />
      </div>
      <MarketStatus />
    </nav>
  );
}

function PulseViewRow({ item, rank }: { item: FeedTake; rank: number }) {
  const vs = useLiveVsSpy(item.holdings ?? [], {
    spyPublish: item.spyPublish,
    storedBenchmark: item.benchmarkIndex,
    fallback: item.vsSpy
  });
  return (
    <li>
      <Link
        href={`/app/takes/${item.id}`}
        className="-mx-2 flex gap-3 rounded-xl px-2 py-2.5 transition-colors duration-150 hover:bg-mist/60"
      >
        <span className="figure w-7 shrink-0 text-[18px] text-teal">{pad2(rank + 1)}</span>
        <span className="min-w-0">
          <span className="view line-clamp-2 text-[13px] font-medium text-ink">{item.sentence ?? "View"}</span>
          <TickValue value={vs} format={(n) => fmtVsLabel(n, 2)} color="sign" className="mt-1 block font-mono text-[11px]" />
        </span>
      </Link>
    </li>
  );
}

function PulseRail({ className = "" }: { className?: string }) {
  const { world } = useWorld();
  const [popular, setPopular] = useState<FeedTake[]>([]);
  const [movers, setMovers] = useState<string[]>([...STOCK_MOVERS]);
  useEffect(() => {
    if (world === "STOCKS") setMovers([...STOCK_MOVERS]);
    fetch(`${API_ORIGIN}/v1/feed?tab=trending&world=${world}`)
      .then((r) => r.json())
      .then((d) => {
        const takes = (d.takes ?? []).slice(0, 3) as FeedTake[];
        setPopular(takes);
        if (world === "MEMES") {
          const symbols = [
            ...new Set(takes.flatMap((t) => (t.holdings ?? []).map((h) => h.symbol).filter(Boolean)))
          ].slice(0, 6);
          setMovers(symbols);
        }
      })
      .catch(() => {
        setPopular([]);
        if (world === "MEMES") setMovers([]);
      });
  }, [world]);

  return (
    <aside aria-label="The pulse" className={className}>
      <div className="glass-card rounded-3xl p-6">
        <div className="flex items-center justify-between">
          <h2 className="display text-[20px] text-ink">The pulse</h2>
          <Pulse size={16} className="text-teal" />
        </div>

        <p className="mt-5 text-[13px] font-medium text-ink">Popular right now</p>
        <ol className="mt-2">
          {popular.map((item, i) => (
            <PulseViewRow key={item.id} item={item} rank={i} />
          ))}
          {!popular.length ? <p className="mt-3 text-[13px] text-muted">Views appear as they publish.</p> : null}
        </ol>

        <div className="my-5 h-px bg-teal/10" />

        <p className="text-[13px] font-medium text-ink">Moving today</p>
        <ul className="mt-2">
          {movers.map((sym) => (
            <MoverRow key={sym} symbol={sym} />
          ))}
          {!movers.length ? <p className="mt-3 text-[13px] text-muted">Quotes appear as coins trade.</p> : null}
        </ul>

        <div className="my-5 h-px bg-teal/10" />
        <div className="flex gap-3">
          <AgentOrb size={24} />
          <p className="text-[13px] text-muted">The agent watches published views and rebalances as the story changes.</p>
        </div>
      </div>
    </aside>
  );
}

function MoverRow({ symbol }: { symbol: string }) {
  const q = useLiveQuote(symbol);
  const { openStock } = useStockSheet();
  return (
    <li>
      <button
        type="button"
        onClick={() => openStock(symbol)}
        className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors duration-150 hover:bg-mist/60"
      >
        <span className="w-14 font-mono text-[12px] font-medium text-ink">{symbol}</span>
        <LivePrice last={q?.last} chgPct={q?.chgPct} pulse={q?.seq} className="min-w-0 flex-1 justify-end px-0 font-mono text-[12px]" />
      </button>
    </li>
  );
}

function BottomTab({
  href,
  label,
  icon: Icon,
  exact
}: {
  href: string;
  label: string;
  icon: typeof House;
  exact?: boolean;
}) {
  const path = usePathname();
  const on = exact ? path === href : path.startsWith(href);
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium ${on ? "text-ink" : "text-muted"}`}
    >
      <Icon size={20} weight={on ? "fill" : "regular"} className={on ? "text-teal" : ""} />
      {label}
    </Link>
  );
}

function BottomNav({ className = "" }: { className?: string }) {
  const path = usePathname();
  const composing = path.startsWith("/app/compose");
  return (
    <nav aria-label="Primary" className={`fixed inset-x-3 bottom-3 z-40 ${className}`}>
      <div className="glass-chrome flex h-16 items-center rounded-[28px] px-2 pb-[env(safe-area-inset-bottom)]">
        <BottomTab href="/app" label="Home" icon={House} exact />
        <BottomTab href="/app/trending" label="Trending" icon={TrendUp} />
        <div className="flex flex-1 justify-center">
          <Link
            href="/app/compose"
            aria-label="New view"
            aria-current={composing ? "page" : undefined}
            className={
              composing
                ? "-mt-8 flex h-14 w-14 items-center justify-center rounded-full bg-lagoon text-white shadow-[0_10px_24px_-12px_rgba(14,116,144,0.6)] ring-4 ring-canvas"
                : "-mt-8 flex h-14 w-14 items-center justify-center rounded-full bg-mist text-ink ring-4 ring-canvas"
            }
          >
            <Plus size={24} weight={composing ? "bold" : "regular"} />
          </Link>
        </div>
        <BottomTab href="/app/pockets" label="Portfolio" icon={ChartPie} />
        <BottomTab href="/app/profile" label="Profile" icon={User} />
      </div>
    </nav>
  );
}
