import { cn } from "@/lib/cn";

export function ThesisHealth({ value }: { value?: number | null }) {
  if (value == null) return null;
  const tone = value >= 70 ? "text-up" : value >= 40 ? "text-caution" : "text-down";
  return (
    <span className={cn("num text-[13px] font-medium", tone)}>
      Thesis {Math.round(value)}
    </span>
  );
}
