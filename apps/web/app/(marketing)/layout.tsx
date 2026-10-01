import Link from "next/link";
import type { ReactNode } from "react";

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen page-canvas">
      <div id="main">{children}</div>
      <footer className="mx-auto w-[min(1200px,calc(100%-24px))] py-14 text-[13px] text-muted">
        <p className="max-w-[52ch]">Stock tokens, not shares. Not advice. Restricted in the US and other countries.</p>
        <div className="mt-5 flex flex-wrap gap-5">
          <Link href="/legal">Legal</Link>
          <Link href="/explore">Trending</Link>
          <Link href="/login">Log in</Link>
        </div>
      </footer>
    </div>
  );
}
