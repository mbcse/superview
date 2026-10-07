import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand";
import { HashLink } from "@/components/marketing/hash-link";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen page-canvas">
      <div id="main">{children}</div>
      <footer className="mx-auto w-[min(1200px,calc(100%-24px))] py-14 text-[13px] text-muted">
        <Wordmark small className="mb-5 text-ink" />
        <p className="max-w-[52ch]">Stock tokens on more than one chain. Memes on their own desk. Not advice. Restricted in the US and other countries.</p>
        <div className="mt-5 flex flex-wrap gap-5">
          <HashLink href="/#how">How it works</HashLink>
          <HashLink href="/#tokens">Stock tokens</HashLink>
          <HashLink href="/#memes">Memes</HashLink>
          <HashLink href="/#astrology">Astrology</HashLink>
          <Link href="/legal">Legal</Link>
          <Link href="/explore">Trending</Link>
          <Link href="/login">Log in</Link>
        </div>
      </footer>
    </div>
  );
}
