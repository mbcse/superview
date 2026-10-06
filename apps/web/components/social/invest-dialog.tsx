"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { X } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { ApiError } from "@/lib/api";

const PRESETS = [100, 250, 500, 1000];
const EASE = [0.23, 1, 0.32, 1] as const;

function formatMoney(n: number) {
  return `$${n.toLocaleString("en-US", { maximumFractionDigits: n % 1 ? 2 : 0 })}`;
}

export function InvestDialog({
  takeId,
  sentence,
  chainId,
  world,
  onClose
}: {
  takeId: string | null;
  sentence?: string | null;
  chainId?: number | null;
  world?: "STOCKS" | "MEMES" | null;
  onClose: () => void;
}) {
  const fetchApi = useAuthedFetch();
  const router = useRouter();
  const reduce = useReducedMotion();
  const [amount, setAmount] = useState("250");
  const [reveal, setReveal] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [liveOk, setLiveOk] = useState(false);
  const [mode, setMode] = useState<"DRY_RUN" | "LIVE">("DRY_RUN");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [fill, setFill] = useState<{ status?: string; fills?: number; skipped?: number } | null>(null);
  const usd = Number(amount);
  const valid = Number.isFinite(usd) && usd >= 1;
  const live = mode === "LIVE";

  useEffect(() => {
    setDone(false);
    setBusy(false);
    setError("");
    setAmount("250");
    setReveal(false);
    setMode("DRY_RUN");
    setOrderId(null);
    setFill(null);
  }, [takeId]);

  useEffect(() => {
    if (!takeId) return;
    fetchApi<{ liveEnabled?: boolean; wallet?: { id?: string } }>("/v1/wallet")
      .then((d) => setLiveOk(Boolean(d.liveEnabled && d.wallet)))
      .catch(() => setLiveOk(false));
  }, [takeId, fetchApi]);

  useEffect(() => {
    if (!takeId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [takeId, onClose]);

  async function invest() {
    if (!takeId || !valid) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetchApi<{
        pocket?: { id: string };
        invest?: { fills?: number; skipped?: number; status?: string; orderId?: string };
      }>(`/v1/takes/${takeId}/back`, {
        method: "POST",
        body: JSON.stringify({ level: mode, mandateMode: "AUTO", amountUsd: usd, revealAmount: reveal })
      });
      let filled = r.invest;
      if (r.pocket?.id && !filled?.status && !filled?.fills) {
        filled = await fetchApi<{ fills?: number; skipped?: number; status?: string; orderId?: string }>(
          live ? `/v1/pockets/${r.pocket.id}/live-invest` : `/v1/pockets/${r.pocket.id}/dry-run-invest`,
          { method: "POST", body: JSON.stringify({ amountUsd: usd }) }
        );
      }
      setOrderId(filled?.orderId ?? null);
      setFill({ status: filled?.status, fills: filled?.fills, skipped: filled?.skipped });
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setError("Sign in to invest.");
      else if (e instanceof ApiError && e.status === 403) setError("Live USDG is off. Use paper.");
      else setError(live ? "Couldn’t spend USDG on this view." : "Couldn’t put paper money on this view.");
    }
    setBusy(false);
  }

  return (
    <AnimatePresence>
      {takeId ? (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center md:items-center md:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-ink/20 backdrop-blur-[2px]" />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby="invest-title"
            initial={reduce ? false : { y: "12%", opacity: 0, scale: 0.96 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 16, opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE }}
            className="glass-sheet relative max-h-[92vh] w-full overflow-y-auto rounded-t-[28px] p-6 pb-8 md:max-w-[480px] md:rounded-[28px] md:p-8"
          >
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-mist hover:text-ink"
            >
              <X size={16} />
            </button>
            {done ? (
              <div className="flex flex-col items-center py-4 text-center">
                <svg viewBox="0 0 64 64" className="h-16 w-16" aria-hidden="true">
                  <circle cx="32" cy="32" r="30" className="fill-gain/10" />
                  <motion.path
                    d="M20 33 L28 41 L45 24"
                    fill="none"
                    className="stroke-gain"
                    strokeWidth={3.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={reduce ? false : { pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.3, delay: 0.08, ease: EASE }}
                  />
                </svg>
                <h2 id="invest-title" className="display mt-5 text-[28px] text-ink">
                  {fill?.status === "PARTIAL"
                    ? "Partial fill"
                    : fill?.status === "FAILED"
                      ? "Order didn’t fill"
                      : fill?.status === "FILLED"
                        ? "You’re invested"
                        : "Pocket created"}
                </h2>
                <p className="mt-2 text-[15px] text-muted">
                  {fill?.status === "FAILED" ? (
                    "No legs filled. Paper cash is still in the pocket."
                  ) : fill?.status === "PARTIAL" ? (
                    <>
                      <span className="font-mono text-ink">{fill.fills ?? 0}</span> names filled
                      {fill.skipped ? `, ${fill.skipped} skipped` : ""}.
                    </>
                  ) : (
                    <>
                      <span className="font-mono text-ink">{formatMoney(usd)}</span>{" "}
                      {live ? "of USDG is now tracking" : "of paper money is now tracking"}
                    </>
                  )}
                </p>
                <p className="mt-4 text-[16px] font-medium leading-snug text-ink">“{sentence ?? "View"}”</p>
                <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-mist px-2.5 py-1 text-[12px] font-medium text-ink">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                  {live ? "Live USDG" : "Paper · no real money"}
                </span>
                <Button
                  className="mt-8"
                  size="lg"
                  variant="primary"
                  fullWidth
                  onClick={() => {
                    const dest = orderId ? `/app/order/${orderId}` : takeId ? `/app/takes/${takeId}` : "/app/pockets";
                    onClose();
                    router.push(dest);
                  }}
                >
                  {orderId ? "See order" : "See this view"}
                </Button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void invest();
                }}
              >
                <h2 id="invest-title" className="text-[13px] font-medium text-muted">
                  Invest in this view
                </h2>
                <p className="mt-3 pr-8 text-[16px] font-medium leading-snug text-ink">“{sentence ?? "View"}”</p>
                {liveOk ? (
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setMode("DRY_RUN")}
                      className={`h-8 rounded-full px-3 text-[12px] ${mode === "DRY_RUN" ? "bg-mist text-ink" : "text-muted"}`}
                    >
                      Paper
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode("LIVE")}
                      className={`h-8 rounded-full px-3 text-[12px] ${live ? "bg-mist text-ink" : "text-muted"}`}
                    >
                      Live USDG
                    </button>
                  </div>
                ) : (
                  <span className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-mist px-2.5 py-1 text-[12px] font-medium text-ink">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal" />
                    Paper · no real money
                  </span>
                )}
                <label htmlFor="invest-amount" className="mt-8 block text-[13px] text-muted">
                  Amount
                </label>
                <div className="mt-1 flex items-baseline border-b border-teal/15 pb-2 focus-within:border-teal/50">
                  <span className="figure text-[40px] text-muted">$</span>
                  <input
                    id="invest-amount"
                    autoFocus
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").slice(0, 9))}
                    className="figure w-full min-w-0 bg-transparent text-[40px] text-ink focus:outline-none"
                  />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setAmount(String(p))}
                      aria-pressed={usd === p}
                      className={`h-9 rounded-full border px-4 font-mono text-[13px] ${
                        usd === p ? "border-teal/40 bg-mist text-ink" : "border-teal/15 bg-glass/70 text-muted hover:text-ink"
                      }`}
                    >
                      ${p.toLocaleString("en-US")}
                    </button>
                  ))}
                </div>
                <p className="mt-8 text-[13px] leading-relaxed text-muted">
                  {live
                    ? chainId === 101
                      ? "This spends live USDC from your Solana wallet after you confirm. Keep 0.03 SOL in the wallet for fees."
                      : "This spends real USDG from your Privy wallet after you confirm. Stock tokens are economic exposure, not share ownership."
                    : world === "MEMES"
                      ? "Paper uses live marks without live money. Meme quotes older than two minutes are treated as stale."
                      : "Paper uses live marks without live money. Stock tokens are economic exposure, not share ownership."}
                </p>
                <label className="mt-4 flex items-start gap-3 text-[13px] text-ink">
                  <input
                    type="checkbox"
                    checked={reveal}
                    onChange={(e) => setReveal(e.target.checked)}
                    className="mt-0.5 size-4 accent-teal"
                  />
                  Show this amount on my view
                </label>
                {error ? <p className="mt-3 text-sm text-down">{error}</p> : null}
                <Button type="submit" size="lg" variant="primary" className="mt-4 w-full" disabled={busy || !valid}>
                  {busy ? "Investing…" : valid ? `Invest ${formatMoney(usd)}` : "Invest"}
                </Button>
              </form>
            )}
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
