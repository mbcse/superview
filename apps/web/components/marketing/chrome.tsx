import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { HashLink } from "@/components/marketing/hash-link";

export function MarketingChrome() {
  return (
    <header className="sticky top-0 z-30 px-3 pt-3 md:px-6">
      <div className="glass-chrome mx-auto flex h-14 max-w-[1320px] items-center justify-between rounded-2xl px-4 md:px-5">
        <Wordmark />
        <nav className="hidden items-center gap-5 text-[14px] lg:flex" aria-label="Product">
          <HashLink className="text-muted hover:text-ink" href="/#how">
            How it works
          </HashLink>
          <HashLink className="text-muted hover:text-ink" href="/#tokens">
            Stock tokens
          </HashLink>
          <HashLink className="text-muted hover:text-ink" href="/#memes">
            Memes
          </HashLink>
          <HashLink className="text-muted hover:text-ink" href="/#astrology">
            Astrology
          </HashLink>
          <Link className="text-muted hover:text-ink" href="/explore">
            Trending
          </Link>
        </nav>
        <div className="flex items-center gap-1">
          <Link className="hidden min-h-9 items-center rounded-full px-4 text-[14px] text-muted hover:text-ink md:inline-flex" href="/login">
            Log in
          </Link>
          <Link className="inline-flex min-h-9 items-center rounded-full bg-lagoon px-4 text-[14px] font-medium text-white shadow-[0_10px_24px_-12px_rgba(14,116,144,0.6)]" href="/signup">
            Sign up
          </Link>
        </div>
      </div>
    </header>
  );
}
