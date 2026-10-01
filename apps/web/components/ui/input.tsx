import { cn } from "../../lib/cn";
import type { InputHTMLAttributes, TextareaHTMLAttributes } from "react";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "min-h-11 w-full rounded-xl border border-teal/15 bg-glass/80 px-3.5 text-[15px] text-ink shadow-none placeholder:text-muted/70 focus:border-teal/50 focus:outline-none focus:ring-2 focus:ring-teal/15",
        className
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "min-h-32 w-full rounded-2xl border border-teal/15 bg-glass/80 px-4 py-3 text-[15px] text-ink placeholder:text-muted/70 focus:border-teal/50 focus:outline-none focus:ring-2 focus:ring-teal/15",
        className
      )}
      {...props}
    />
  );
}
