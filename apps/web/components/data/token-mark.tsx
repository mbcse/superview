"use client";

import { useEffect, useState } from "react";
import { API_ORIGIN, tick } from "@/lib/fmt";
import { cn } from "@/lib/cn";
import { tokenImageSrc } from "@/lib/world";
import { ChainMark, resolveChainId } from "@/components/data/chain-mark";

export function stockTick(symbol: string, chainId?: number, logoUrl?: string | null) {
  const chain = resolveChainId(symbol, chainId, logoUrl);
  let t = tick(symbol);
  if (chain === 4663 && t.startsWith("RH") && t.length > 2) t = t.slice(2);
  if ((chain === 101 || chain === 143) && t.length >= 3 && t.endsWith("X")) t = t.slice(0, -1);
  if (chain === 8453 && t.length >= 3 && t.endsWith("C")) t = t.slice(0, -1);
  if (!chain && t.startsWith("RH") && t.length > 2 && t.length <= 8) t = t.slice(2);
  return t;
}

export function tickerWord(symbol: string, chainId?: number, logoUrl?: string | null) {
  return stockTick(symbol, chainId, logoUrl).slice(0, 5);
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

function deskTone(chainId?: number) {
  if (chainId === 101) return "bg-lagoon text-white";
  if (chainId === 8453) return "bg-[#0052FF] text-white";
  if (chainId === 143) return "bg-[#836EF9] text-white";
  if (chainId === 4663) return "bg-[#00C805] text-white";
  return "bg-mist text-teal";
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
  const chain = resolveChainId(symbol, chainId, logoUrl);
  const base = logoUrl ? tokenImageSrc(logoUrl, API_ORIGIN) : "";
  const src = base && attempt ? `${base}&r=${attempt}` : base;
  const word = tickerWord(symbol, chain, logoUrl);
  const round = size <= 24 ? "rounded-md" : "rounded-xl";
  const badge = Math.max(10, Math.round(size * 0.42));

  return (
    <span className={cn("relative inline-flex shrink-0", className)} style={{ width: size, height: size }} title={stockTick(symbol, chain, logoUrl)}>
      <span className={cn("relative flex size-full overflow-hidden", round)}>
        <span
          className={cn(
            "flex size-full flex-col items-center justify-center font-bold leading-none tracking-[-0.05em]",
            wordClass(size, word.length),
            deskTone(chain)
          )}
        >
          <span>{word}</span>
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
      {chain && size >= 20 ? (
        <span
          className="absolute -bottom-0.5 -right-0.5 flex items-center justify-center rounded-full bg-white shadow-[0_0_0_1.5px_#fff]"
          style={{ width: badge, height: badge }}
          aria-hidden
        >
          <ChainMark chainId={chain} size={badge} />
        </span>
      ) : null}
    </span>
  );
}
