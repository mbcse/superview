import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function EmptyState({
  title,
  body,
  action
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-md py-20 text-center">
      <h2 className="display text-[28px] text-ink">{title}</h2>
      {body ? <p className="mt-3 text-[15px] text-muted">{body}</p> : null}
      {action ? <div className="mt-6 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone = "flat"
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "up" | "down" | "flat";
}) {
  return (
    <div>
      <p className="text-[13px] leading-[18px] text-muted">{label}</p>
      <p
        className={cn(
          "figure mt-1 text-[28px]",
          tone === "up" && "text-up",
          tone === "down" && "text-down"
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-1 text-[13px] text-muted">{hint}</p> : null}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
  eyebrow
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  eyebrow?: string;
}) {
  return (
    <header className="flex flex-wrap items-start justify-between gap-4 px-1 pb-2 pt-4">
      <div>
        {eyebrow ? <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-teal">{eyebrow}</div> : null}
        <h1 className="display mt-2 text-[28px] text-ink md:text-[32px]">{title}</h1>
        {description ? <p className="mt-2 max-w-[42rem] text-[15px] text-muted">{description}</p> : null}
      </div>
      {actions}
    </header>
  );
}

export function Surface({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("glass-card rounded-[28px]", className)}>{children}</section>;
}

export function Chip({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "paper" | "live" | "up" | "down";
}) {
  return (
    <span
      className={cn(
        "inline-flex min-h-7 items-center rounded-full px-2.5 text-[13px] font-medium",
        tone === "neutral" && "bg-mist text-muted",
        tone === "paper" && "border border-teal/20 bg-mist text-ink",
        tone === "live" && "bg-positive-soft text-up",
        tone === "up" && "bg-positive-soft text-up",
        tone === "down" && "bg-loss/10 text-down"
      )}
    >
      {children}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("shimmer rounded-[12px]", className)} />;
}

export function Notice({
  tone = "info",
  children
}: {
  tone?: "info" | "ok" | "warn";
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "rounded-2xl border px-4 py-3 text-[14px]",
        tone === "info" && "border-teal/15 bg-mist text-ink",
        tone === "ok" && "border-up/20 bg-positive-soft text-up",
        tone === "warn" && "border-warn/25 bg-warn/5 text-ink"
      )}
    >
      {children}
    </div>
  );
}
