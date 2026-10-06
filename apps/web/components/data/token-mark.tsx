"use client";

import { useEffect, useState } from "react";
import { API_ORIGIN, tick } from "@/lib/fmt";
import { cn } from "@/lib/cn";
import { tokenImageSrc } from "@/lib/world";

function solanaDesk(chainId?: number, logoUrl?: string | null) {
  if (chainId === 101) return true;
  return /xstocks-metadata|backed\.fi|jup\.ag|bags\.fm/i.test(logoUrl ?? "");
}

export function stockTick(symbol: string, chainId?: number) {
  let t = tick(symbol);
  if (chainId === 101 && t.length >= 3 && t.endsWith("X")) t = t.slice(0, -1);
  return t;
}

export function tickerWord(symbol: string, chainId?: number) {
  return stockTick(symbol, chainId).slice(0, 5);
}

function wordClass(size: number, n: number) {
  if (size <= 24) {
    if (n <= 2) return "text-[10px]";
    if (n === 3) return "text-[8px]";
    return "text-[7px]";
  }
  if (size <= 32) {
    if (n <= 2) return "text-[12px]";
    if (n === 3) return "text-[10px]";
    return "text-[9px]";
  }
  if (n <= 2) return "text-[15px]";
  if (n === 3) return "text-[12px]";
  return "text-[11px]";
}

function SolBars({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 12" className={className} aria-hidden>
      <rect x="1" y="0" width="14" height="2.6" rx="1.1" fill="currentColor" />
      <rect x="1" y="4.7" width="14" height="2.6" rx="1.1" fill="currentColor" opacity="0.72" />
      <rect x="1" y="9.4" width="14" height="2.6" rx="1.1" fill="currentColor" opacity="0.44" />
    </svg>
  );
}

export function TokenMark({
  symbol,
  logoUrl,
  chainId,
  size = 24,
  className
}: {
  symbol: string;
  logoUrl?: string | null;
  chainId?: number;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    setFailed(false);
    setAttempt(0);
  }, [logoUrl, symbol]);
  const sol = solanaDesk(chainId, logoUrl);
  const base = logoUrl ? tokenImageSrc(logoUrl, API_ORIGIN) : "";
  const src = base && attempt ? `${base}&r=${attempt}` : base;
  const word = tickerWord(symbol, chainId);
  const round = size <= 24 ? "rounded-md" : "rounded-xl";

  return (
    <span
      className={cn("relative inline-flex shrink-0 overflow-hidden", round, className)}
      style={{ width: size, height: size }}
      title={stockTick(symbol, chainId)}
    >
      <span
        className={cn(
          "flex size-full flex-col items-center justify-center font-bold leading-none tracking-[-0.05em]",
          wordClass(size, word.length),
          sol ? "bg-lagoon text-white" : "bg-mist text-teal"
        )}
      >
        <span>{word}</span>
        {sol ? <SolBars className="mt-[2px] h-[22%] w-[58%] text-white/90" /> : null}
      </span>
      {src && !failed ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          referrerPolicy="no-referrer"
          className="absolute inset-0 size-full object-cover"
          onLoad={() => setFailed(false)}
          onError={() => {
            if (attempt < 1) setAttempt(1);
            else setFailed(true);
          }}
        />
      ) : null}
    </span>
  );
}
