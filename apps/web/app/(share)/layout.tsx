import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand";
import Link from "next/link";

export default function ShareLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen w-full">
      <header className="mx-auto flex h-16 max-w-[820px] items-center justify-between px-5">
        <Wordmark href="/" />
        <Link
          className="inline-flex min-h-8 items-center rounded-full border border-teal/15 bg-glass/80 px-3.5 text-[13px] font-medium text-ink hover:border-teal/35"
          href="/"
        >
          Open SuperView
        </Link>
      </header>
      <main id="main" className="mx-auto max-w-[720px] px-5 pb-20 pt-10 md:pt-16">
        {children}
      </main>
    </div>
  );
}
