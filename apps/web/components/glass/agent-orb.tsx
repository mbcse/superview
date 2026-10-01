import { cn } from "@/lib/cn";

export function AgentOrb({ size = 24, className }: { size?: number; className?: string }) {
  return (
    <span
      className={cn("relative inline-flex shrink-0 items-center justify-center", className)}
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="absolute inset-0 rounded-full bg-aqua/25" />
      <span className="absolute inset-[18%] rounded-full bg-lagoon" />
      <span className="absolute inset-[38%] rounded-full bg-aqua" />
    </span>
  );
}
