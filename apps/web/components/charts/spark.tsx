import { cn } from "@/lib/cn";

export function Spark({ values, label, className }: { values: number[]; label: string; className?: string }) {
  if (values.length < 2) return <span className="sr-only">{label}</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const d = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * 150;
      const y = 40 - ((v - min) / span) * 34;
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg className={cn("h-11 w-28 sm:w-36", className)} viewBox="0 0 150 44" preserveAspectRatio="none" aria-label={label} role="img">
      <path className="sparkline" d={d} />
    </svg>
  );
}

export function Sparkline({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 150 44" preserveAspectRatio="none" aria-hidden="true">
      <path className="sparkline" d="M0 34 L10 32 L17 35 L25 25 L35 29 L44 22 L53 27 L61 18 L70 22 L78 16 L87 19 L96 11 L103 17 L112 8 L122 13 L131 7 L140 10 L150 2" />
    </svg>
  );
}
