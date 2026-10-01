import Link from "next/link";
import { cn } from "@/lib/cn";

export function Mark({ className = "h-[19px] w-[19px]" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 14.5c2.2-1.2 3.6-4.2 4.4-7.3.6 2.6 1.8 5.1 3.6 6.8 1.4 1.3 3.3 2 5.5 2.2"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16.2 12.8 19 16.5l-4.4.6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Wordmark({
  href = "/",
  className,
  small,
  light
}: {
  href?: string;
  className?: string;
  small?: boolean;
  light?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center rounded font-semibold tracking-[-0.03em] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40",
        small ? "text-[20px] leading-none" : "text-[24px] leading-none",
        light ? "text-white" : "text-ink",
        className
      )}
      translate="no"
    >
      SuperView
    </Link>
  );
}
