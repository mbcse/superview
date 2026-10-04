import Link from "next/link";
import { cn } from "@/lib/cn";

export const LOGO_SRC = "/superview-logo.png";

export function Mark({ className = "size-[28px]" }: { className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={LOGO_SRC} alt="" width={28} height={28} className={cn("shrink-0", className)} />
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
        "inline-flex items-center gap-2 rounded font-display font-semibold tracking-[-0.03em] no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40",
        small ? "text-[20px] leading-none" : "text-[24px] leading-none",
        light ? "text-white" : "text-ink",
        className
      )}
      translate="no"
    >
      <Mark className={small ? "size-6" : "size-7"} />
      SuperView
    </Link>
  );
}
