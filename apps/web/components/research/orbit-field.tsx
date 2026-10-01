"use client";

interface OrbitFieldProps {
  tickers: string[];
}

const RINGS = [
  { size: 560, duration: 60, reverse: false },
  { size: 820, duration: 90, reverse: true },
  { size: 1120, duration: 140, reverse: false }
];

export function OrbitField({ tickers }: OrbitFieldProps) {
  const perRing = [tickers.slice(0, 2), tickers.slice(2, 4), tickers.slice(4)];
  return (
    <div className="pointer-events-none absolute left-[20%] top-[58%]" aria-hidden="true">
      {RINGS.map((ring, r) => (
        <div
          key={ring.size}
          className="orbit-spin absolute rounded-full border border-sky/15"
          style={{
            width: ring.size,
            height: ring.size,
            left: -ring.size / 2,
            top: -ring.size / 2,
            animationDuration: `${ring.duration}s`,
            animationDirection: ring.reverse ? "reverse" : "normal"
          }}
        >
          {(perRing[r] ?? []).map((ticker, k) => (
            <div
              key={ticker}
              className="absolute inset-0"
              style={{ transform: `rotate(${(k / Math.max(1, perRing[r]?.length ?? 1)) * 360 + r * 40}deg)` }}
            >
              <span className="absolute left-1/2 top-0 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-aqua shadow-[0_0_10px_2px_rgb(46_196_182/0.7)]" />
                <span className="font-mono text-[10px] text-white/60">{ticker.replace(/^RH/, "")}</span>
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
