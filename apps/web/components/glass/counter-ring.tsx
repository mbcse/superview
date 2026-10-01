export function CounterRing({
  count,
  max,
  warnAt
}: {
  count: number;
  max: number;
  warnAt: number;
}) {
  const r = 10;
  const c = 2 * Math.PI * r;
  const p = Math.min(count / max, 1);
  const warn = count >= warnAt;
  return (
    <div className="flex items-center gap-2 text-[13px] text-muted">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r={r} fill="none" stroke="rgb(14 143 143 / 0.12)" strokeWidth="2.5" />
        <circle
          cx="14"
          cy="14"
          r={r}
          fill="none"
          stroke={warn ? "#b06c08" : "#0e8f8f"}
          strokeWidth="2.5"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - p)}
          strokeLinecap="round"
          transform="rotate(-90 14 14)"
        />
      </svg>
      <span className={`num ${warn ? "text-warn" : ""}`}>
        {count}/{max}
      </span>
    </div>
  );
}
