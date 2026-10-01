import { cn } from "@/lib/cn";

const LABELS: Record<string, string> = {
  direct: "Direct",
  indirect: "Indirect",
  shared_interest: "Shared interest",
  hedge: "Hedge"
};

const TONES: Record<string, string> = {
  direct: "bg-teal/10 text-teal",
  indirect: "bg-sky/15 text-sky-deep",
  shared_interest: "bg-aqua/15 text-teal",
  hedge: "bg-mist text-muted"
};

export function RoleChip({ role }: { role: string }) {
  const key = role.toLowerCase();
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium", TONES[key] ?? "bg-secondary text-muted")}>
      {LABELS[key] ?? role}
    </span>
  );
}
