"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";

const CHAINS = {
  101: { label: "Solana", short: "SOL" },
  8453: { label: "Base", short: "Base" },
  143: { label: "Monad", short: "Monad" },
  4663: { label: "Robinhood", short: "RH" }
} as const;

export function resolveChainId(symbol?: string | null, chainId?: number | null, logoUrl?: string | null): number | undefined {
  if (chainId === 101 || chainId === 8453 || chainId === 143 || chainId === 4663) return chainId;
  if (/xstocks-metadata|backed\.fi/i.test(logoUrl ?? "")) return 101;
  if (/metadata\.coinbase\.com/i.test(logoUrl ?? "")) return 8453;
  const raw = String(symbol ?? "");
  if (/^RH[A-Z.]{1,6}$/i.test(raw)) return 4663;
  if (/x$/i.test(raw) && /[a-z]/.test(raw)) return 101;
  if (/c$/i.test(raw) && /[a-z]/.test(raw)) return 8453;
  return undefined;
}

export function chainName(chainId?: number | null) {
  return chainId && chainId in CHAINS ? CHAINS[chainId as keyof typeof CHAINS].label : null;
}

export function ChainMark({
  chainId,
  size = 14,
  className
}: {
  chainId?: number | null;
  size?: number;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  if (chainId === 101) return <SolanaMark id={id} size={size} className={className} />;
  if (chainId === 8453) return <BaseMark size={size} className={className} />;
  if (chainId === 143) return <MonadMark size={size} className={className} />;
  if (chainId === 4663) return <RobinhoodMark size={size} className={className} />;
  return null;
}

export function ChainChip({
  chainId,
  className
}: {
  chainId?: number | null;
  className?: string;
}) {
  const name = chainName(chainId);
  if (!name || chainId == null) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-white/80 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-ink ring-1 ring-teal/12",
        className
      )}
    >
      <ChainMark chainId={chainId} size={10} />
      {name}
    </span>
  );
}

function SolanaMark({ id, size, className }: { id: string; size: number; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} aria-hidden>
      <defs>
        <linearGradient id={`sol-${id}`} x1="2" y1="14" x2="14" y2="2" gradientUnits="userSpaceOnUse">
          <stop stopColor="#9945FF" />
          <stop offset="1" stopColor="#14F195" />
        </linearGradient>
      </defs>
      <circle cx="8" cy="8" r="8" fill="#0b0b12" />
      <path
        fill={`url(#sol-${id})`}
        d="M3.35 10.85 4.4 9.85h7.9c.26 0 .4.32.21.5l-1.05 1H3.56c-.26 0-.4-.32-.21-.5Zm0-2.85L4.4 7h7.9c.26 0 .4.32.21.5l-1.05 1H3.56c-.26 0-.4-.32-.21-.5Zm8.11-1.85L10.41 5.15H3.56c-.26 0-.4-.32-.21-.5L4.4 3.65h7.9c.26 0 .4.32.21.5Z"
      />
    </svg>
  );
}

function BaseMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} aria-hidden>
      <circle cx="8" cy="8" r="8" fill="#0052FF" />
      <rect x="5.15" y="5.15" width="5.7" height="5.7" rx="1.15" fill="#fff" />
    </svg>
  );
}

function MonadMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} aria-hidden>
      <circle cx="8" cy="8" r="8" fill="#836EF9" />
      <path
        fill="#fff"
        d="M8 3.1 12.4 8 8 12.9 3.6 8 8 3.1Zm0 2.35L5.7 8 8 10.55 10.3 8 8 5.45Z"
      />
    </svg>
  );
}

function RobinhoodMark({ size, className }: { size: number; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" width={size} height={size} className={className} aria-hidden>
      <circle cx="8" cy="8" r="8" fill="#00C805" />
      <path
        fill="#fff"
        d="M4.2 9.4c1.7-2.6 3.6-3.9 6.3-4.3.2 1.6-.2 3.2-1.2 4.5 1.4-.15 2.5-.7 3.5-1.6-.15 2.3-1.8 4.1-4.1 4.6-2.4.15-4.1-1.1-4.5-3.2Z"
      />
    </svg>
  );
}
