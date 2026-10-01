import { cn } from "../../lib/cn";
import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "lime" | "outline" | "quiet";
type Size = "md" | "lg" | "sm" | "icon";

export function Button({
  className,
  variant = "secondary",
  size = "md",
  fullWidth,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; fullWidth?: boolean }) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium transition-[transform,background-color,opacity,box-shadow,filter,border-color,color] duration-150 ease-out enabled:active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40",
        size === "lg" && "min-h-12 px-6 text-[15px]",
        size === "md" && "min-h-10 px-5 text-[14px]",
        size === "sm" && "min-h-8 px-3.5 text-[13px]",
        size === "icon" && "size-10 min-h-0 px-0",
        variant === "primary" && "bg-lagoon text-white shadow-[0_10px_24px_-12px_rgba(14,116,144,0.6)] hover:brightness-110 disabled:shadow-none",
        variant === "lime" && "bg-lagoon text-white shadow-[0_10px_24px_-12px_rgba(14,116,144,0.6)] hover:brightness-110 disabled:shadow-none",
        variant === "quiet" && "bg-transparent text-muted hover:bg-mist/80 hover:text-ink",
        variant === "secondary" && "border border-teal/15 bg-glass/80 text-ink hover:border-teal/35 hover:bg-glass",
        variant === "ghost" && "border border-teal/15 bg-glass/80 text-ink hover:border-teal/35 hover:bg-glass",
        variant === "outline" && "border border-teal/15 bg-transparent text-ink hover:border-teal/35 hover:bg-glass/80",
        variant === "danger" && "bg-down text-white hover:brightness-110",
        fullWidth && "w-full",
        className
      )}
      {...props}
    />
  );
}
