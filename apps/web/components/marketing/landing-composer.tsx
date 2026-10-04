"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { signupHref } from "@/lib/auth-paths";
import { useAuth } from "@/components/auth-provider";

export function LandingComposer() {
  const [value, setValue] = useState("");
  const router = useRouter();
  const { authenticated } = useAuth();

  function submit(e: FormEvent) {
    e.preventDefault();
    const next = value.trim();
    if (next.length >= 3) {
      sessionStorage.setItem("superview-draft", next);
      router.push(authenticated ? "/app/compose" : signupHref("/app/compose"));
      return;
    }
    router.push(authenticated ? "/app" : "/signup");
  }

  return (
    <form onSubmit={submit} className="mt-4 flex min-h-11 items-center gap-2 rounded-full border border-teal/15 bg-white/75 py-1 pl-4 pr-1 shadow-[inset_0_1px_0_rgb(255_255_255_/_0.9)]">
      <label className="sr-only" htmlFor="landing-view">
        Write a view
      </label>
      <input
        id="landing-view"
        value={value}
        onChange={(e) => setValue(e.target.value.slice(0, 220))}
        placeholder="Write a view…"
        maxLength={220}
        className="min-h-9 min-w-0 flex-1 bg-transparent text-[14px] tracking-[-0.014em] text-ink outline-none placeholder:text-muted"
      />
      <button
        type="submit"
        className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full bg-lagoon px-3.5 text-[13px] font-medium text-white shadow-[0_10px_24px_-12px_rgba(14,116,144,0.6)]"
      >
        Put this view
        <ArrowRight size={13} />
      </button>
    </form>
  );
}
