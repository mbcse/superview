"use client";

import { useEffect, useState } from "react";
import { Check, CopySimple } from "@phosphor-icons/react";
import { useAuth } from "@/components/auth-provider";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { useWalletCash } from "@/components/wallet-cash";
import { AddCashButton } from "@/components/add-cash";
import { Button } from "@/components/ui/button";
import { PageHeader, Surface } from "@/components/ui/surface";
import { ChainMark } from "@/components/data/chain-mark";
import { fmtUsd, orderStatusLabel } from "@/lib/fmt";
import { shortAddr } from "@/lib/wallet-cash";

type PocketRow = { id: string; mode?: string; take?: { revisions?: Array<{ sentence?: string }> }; mark?: { cashUsd?: number } };

const SWAP_DESKS = [
  { chainId: 8453, symbol: "USDC", label: "Base" },
  { chainId: 101, symbol: "USDC", label: "Solana" },
  { chainId: 4663, symbol: "USDG", label: "Robinhood" }
] as const;

export default function WalletPage() {
  const { displayName, authProvider } = useAuth();
  const fetchApi = useAuthedFetch();
  const { wallet, refresh } = useWalletCash();
  const [pockets, setPockets] = useState<PocketRow[]>([]);
  const [pocketId, setPocketId] = useState("");
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [copied, setCopied] = useState(false);
  const usd = Number(amount);
  const paperPockets = pockets.filter((p) => p.mode !== "LIVE");
  const selected = paperPockets.find((p) => p.id === pocketId) ?? paperPockets[0];
  const mera = wallet?.signer === "MERA" || authProvider === "MERA";
  const address = wallet?.wallet?.address ?? wallet?.balances?.find((b) => b.chainId === 8453)?.address ?? "";
  const home = wallet?.homeCashUsd ?? 0;
  const ausd = wallet?.balances?.find((b) => b.chainId === 143);
  const leftover = SWAP_DESKS.map((desk) => {
    const row = wallet?.balances?.find((b) => b.chainId === desk.chainId);
    return { ...desk, usd: row?.usd ?? null };
  }).filter((d) => d.chainId !== 8453 && (d.usd ?? 0) > 0);
  const pending = (wallet?.pending?.length ?? 0) > 0;

  useEffect(() => {
    fetchApi<{ pockets: PocketRow[] }>("/v1/pockets")
      .then((desk) => {
        const next = desk.pockets ?? [];
        setPockets(next);
        setPocketId((id) => id || next.find((p) => p.mode !== "LIVE")?.id || "");
      })
      .catch(() => setPockets([]));
  }, [fetchApi]);

  async function movePaper(kind: "deposit" | "withdraw") {
    if (!selected || !Number.isFinite(usd) || usd <= 0) return;
    setBusy(true);
    setNotice("");
    try {
      const r = await fetchApi<{ usd?: number; remainingUsd?: number; error?: string }>(`/v1/pockets/${selected.id}/${kind}`, {
        method: "POST",
        body: JSON.stringify({ amountUsd: usd })
      });
      const desk = await fetchApi<{ pockets: PocketRow[] }>("/v1/pockets");
      setPockets(desk.pockets ?? []);
      setNotice(
        kind === "deposit"
          ? `Added $${Number(r.usd ?? usd).toLocaleString()} paper cash.`
          : `Withdrew $${Number(r.usd ?? usd).toLocaleString()} paper. $${Number(r.remainingUsd ?? 0).toLocaleString()} left.`
      );
    } catch {
      setNotice(kind === "withdraw" ? "Not enough paper cash." : "Couldn’t move paper cash.");
    }
    setBusy(false);
  }

  return (
    <div className="space-y-6 px-5 pb-10 pt-9 sm:px-8">
      <PageHeader title="Wallet" description="One USDC. We swap it onto the desk when you invest." />

      <Surface className="p-6">
        <p className="text-[13px] font-medium text-muted">USDC</p>
        <p className={`figure mt-2 text-[40px] ${pending ? "animate-pulse text-muted" : "text-ink"}`}>{fmtUsd(home)}</p>
        <p className="mt-3 text-[14px] leading-relaxed text-muted">
          Other desks only need this USDC. On invest we swap it to USDG on Robinhood, or USDC on Solana and Base. You do not need ETH or SOL.
        </p>
        {!wallet?.gasSponsored ? (
          <p className="mt-2 text-[13px] text-down">Gas sponsorship is paused. Live moves may wait.</p>
        ) : null}
        <div className="mt-5">
          <AddCashButton amount="5" />
        </div>
        {leftover.length ? (
          <ul className="mt-5 space-y-2">
            {leftover.map((d) => (
              <li key={d.chainId} className="flex items-center justify-between gap-3 text-[13px]">
                <span className="flex items-center gap-2 text-muted">
                  <ChainMark chainId={d.chainId} size={16} />
                  Left on {d.label} after swap · {d.symbol}
                </span>
                <span className="font-mono text-ink">{fmtUsd(d.usd)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        <div className="mt-6 rounded-[16px] bg-canvas p-4">
          <p className="flex items-center gap-2 text-[13px] text-muted">
            <ChainMark chainId={143} size={16} />
            Monad needs AUSD
          </p>
          <p className="mt-2 font-mono text-[12px] font-semibold uppercase tracking-[0.06em] text-teal">AUSD</p>
          <p className="num mt-1 text-[28px] font-semibold">{ausd?.usd == null ? "—" : fmtUsd(ausd.usd)}</p>
          {ausd?.address ? <p className="mt-2 font-mono text-[11px] text-muted">{shortAddr(ausd.address)}</p> : null}
        </div>
      </Surface>

      <Surface className="p-6">
        <p className="text-[13px] font-medium text-muted">Wallet details</p>
        <p className="mt-2 text-[16px] font-medium text-ink">{displayName}</p>
        <p className="mt-1 text-[13px] text-muted">{mera ? "Face ID · keys stay on this device" : "Privy embedded wallet"}</p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <p className="font-mono text-[14px] text-ink">{address ? shortAddr(address) : "No wallet yet."}</p>
          {address ? (
            <button
              type="button"
              aria-label="Copy address"
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-mist hover:text-ink"
              onClick={() => {
                void navigator.clipboard.writeText(address);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
            >
              {copied ? <Check size={16} /> : <CopySimple size={16} />}
            </button>
          ) : null}
        </div>
        {address ? (
          <a
            href={`https://basescan.org/address/${address}`}
            target="_blank"
            rel="noreferrer"
            className="mt-2 inline-block text-[13px] text-teal hover:underline"
          >
            View on explorer
          </a>
        ) : null}
        <p className="mt-3 text-[13px] text-muted">
          {mera
            ? "Each live trade asks for Face ID."
            : wallet?.grant?.expiresAt
              ? `Grant until ${new Date(wallet.grant.expiresAt).toLocaleDateString()}`
              : "No signer grant yet"}
        </p>
        {!mera && wallet?.wallet?.id ? (
          <Button
            className="mt-4"
            variant="ghost"
            onClick={async () => {
              await fetchApi(`/v1/wallets/${wallet.wallet!.id}/grant`, { method: "POST", body: JSON.stringify({ allowedContracts: [] }) });
              await refresh();
            }}
          >
            Create signer grant
          </Button>
        ) : null}
      </Surface>

      <Surface className="p-6">
        <p className="text-[13px] font-medium text-muted">Activity</p>
        {(wallet?.activity ?? []).length ? (
          <ul className="mt-4 space-y-3">
            {wallet!.activity!.map((row) => (
              <li key={row.id} className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[14px] text-ink">
                    {row.what}
                    {row.view ? ` · ${row.view}` : ""}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {orderStatusLabel(row.status)}
                    {row.chainId ? ` · ${row.chainId}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-[13px] text-ink">{row.amountUsd != null ? fmtUsd(row.amountUsd) : ""}</p>
                  {row.explorer ? (
                    <a href={row.explorer} target="_blank" rel="noreferrer" className="text-[12px] text-teal hover:underline">
                      Explorer
                    </a>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-muted">Fund, invest, sell, and withdraw show up here.</p>
        )}
      </Surface>

      <div className="h-px bg-teal/10" />
      <p className="text-[11px] uppercase tracking-[0.08em] text-muted">Paper (not real money)</p>
      <Surface className="p-6">
        <p className="text-[15px] text-ink">Move paper USD in a pocket. This is not on-chain money.</p>
        {selected ? (
          <>
            <label className="mt-4 block text-[13px] text-muted" htmlFor="paper-pocket">
              Pocket
            </label>
            <select
              id="paper-pocket"
              value={selected.id}
              onChange={(e) => setPocketId(e.target.value)}
              className="mt-1 w-full rounded-xl border border-teal/15 bg-glass/70 px-3 py-2 text-[14px] text-ink"
            >
              {paperPockets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.take?.revisions?.[0]?.sentence ?? p.id} · ${Number(p.mark?.cashUsd ?? 0).toLocaleString()}
                </option>
              ))}
            </select>
            <label className="mt-4 block text-[13px] text-muted" htmlFor="paper-amount">
              Amount
            </label>
            <input
              id="paper-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").slice(0, 9))}
              className="mt-1 w-full rounded-xl border border-teal/15 bg-glass/70 px-3 py-2 font-mono text-[16px] text-ink"
            />
            <div className="mt-4 flex gap-2">
              <Button variant="primary" disabled={busy || !Number.isFinite(usd) || usd <= 0} onClick={() => void movePaper("deposit")}>
                Deposit paper
              </Button>
              <Button variant="ghost" disabled={busy || !Number.isFinite(usd) || usd <= 0} onClick={() => void movePaper("withdraw")}>
                Withdraw paper
              </Button>
            </div>
            {notice ? <p className="mt-3 text-[13px] text-muted">{notice}</p> : null}
          </>
        ) : (
          <p className="mt-3 text-[13px] text-muted">Publish a view first to hold paper cash.</p>
        )}
      </Surface>
    </div>
  );
}
