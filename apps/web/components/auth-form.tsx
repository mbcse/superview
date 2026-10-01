"use client";

import { useSearchParams } from "next/navigation";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Wordmark } from "@/components/brand";
import { PrivyLoginButtons } from "@/components/privy-login-buttons";
import { SegmentedTabs } from "@/components/data/segmented-tabs";

function SampleViewStack() {
  const cards = [
    { who: "Maya", text: "Power demand will keep outrunning the grid." },
    { who: "Arjun", text: "The next decade belongs to whoever owns the compute." },
    { who: "Leah", text: "Healthcare gets cheaper when diagnosis gets faster." }
  ];
  return (
    <div className="relative mx-auto h-[220px] w-full max-w-md">
      {cards.map((c, i) => (
        <div
          key={c.who}
          className="glass-card absolute inset-x-0 rounded-2xl p-5"
          style={{ top: i * 28, transform: `scale(${1 - i * 0.04})`, zIndex: 3 - i }}
        >
          <p className="text-[12px] text-muted">{c.who}</p>
          <p className="mt-2 text-[16px] font-medium leading-snug text-ink">{c.text}</p>
        </div>
      ))}
    </div>
  );
}

export default function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const { login, authenticated, ready } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get("next") ?? "/app";
  const privy = Boolean(process.env.NEXT_PUBLIC_PRIVY_APP_ID);
  const dest = next.startsWith("/") ? next : "/app";

  useEffect(() => {
    if (ready && authenticated) router.replace(dest);
  }, [ready, authenticated, dest, router]);

  async function go() {
    await login();
    if (!privy) router.replace(dest);
  }

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[1.1fr_1fr]">
      <section className="relative m-3 flex min-h-[320px] flex-col overflow-hidden rounded-[32px] p-8 md:p-12 lg:min-h-0">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/signin-water.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
        <div className="absolute inset-0 bg-glass/30" />
        <div className="relative">
          <Wordmark href="/" />
        </div>
        <div className="relative mt-10 flex flex-1 flex-col justify-center gap-12 lg:mt-0">
          <h1 className="display max-w-xl text-[32px] text-ink md:text-[44px]">
            Say what you believe about the world. Watch it play out.
          </h1>
          <div className="hidden md:block">
            <SampleViewStack />
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-5 py-10 md:px-10">
        <div className="glass-card w-full max-w-[420px] rounded-[28px] p-7 md:p-9">
          <h2 className="display text-[28px] text-ink">{mode === "login" ? "Welcome back" : "Create your account"}</h2>
          <p className="mt-2 text-[13px] text-muted">
            {mode === "login" ? "Pick up where your views left off." : "Your first view is one sentence away."}
          </p>
          <div className="mt-6">
            <SegmentedTabs
              options={["Sign in", "Create account"]}
              value={mode === "login" ? "Sign in" : "Create account"}
              onChange={(v) => router.push(v === "Sign in" ? `/login?next=${encodeURIComponent(next)}` : `/signup?next=${encodeURIComponent(next)}`)}
              layoutId="signin-mode"
            />
          </div>
          <div className="mt-6">
            {privy ? (
              <PrivyLoginButtons disabled={!ready} />
            ) : (
              <Button variant="primary" size="lg" className="h-12 w-full" onClick={() => void go()} disabled={!ready}>
                {mode === "login" ? "Sign in" : "Create account"}
              </Button>
            )}
          </div>
          <p className="mt-6 text-center text-[12px] text-muted">
            Stock tokens represent economic exposure, not share ownership. Paper is simulated money.
          </p>
        </div>
      </section>
    </div>
  );
}
