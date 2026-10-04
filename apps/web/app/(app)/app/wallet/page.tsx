"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { Button } from "@/components/ui/button";
import { PageHeader, Surface } from "@/components/ui/surface";

type PocketRow = { id: string; mode?: string; take?: { revisions?: Array<{ sentence?: string }> }; mark?: { cashUsd?: number } };
type WalletData = {
  usdgUsd?: number | null;
  liveEnabled?: boolean;
  wallet?: { id?: string; address?: string };
  grant?: { expiresAt?: string } | null;
  pending?: Array<{ id: string; status: string; txHash?: string }>;
};

export default function WalletPage() {
  const { displayName } = useAuth();
  const fetchApi = useAuthedFetch();
  const [data, setData] = useState<WalletData | null>(null);
  const [pockets, setPockets] = useState<PocketRow[]>([]);
  const [pocketId, setPocketId] = useState("");
  const [amount, setAmount] = useState("100");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const usd = Number(amount);
  const paperPockets = pockets.filter((p) => p.mode !== "LIVE");
  const selected = paperPockets.find((p) => p.id === pocketId) ?? paperPockets[0];

  useEffect(() => {
    Promise.all([
      fetchApi<WalletData>("/v1/wallet").catch(() => null),
      fetchApi<{ pockets: PocketRow[] }>("/v1/pockets").catch(() => ({ pockets: [] }))
    ]).then(([wallet, desk]) => {
      setData(wallet);
      const next = desk.pockets ?? [];
      setPockets(next);
      setPocketId((id) => id || next.find((p) => p.mode !== "LIVE")?.id || "");
    });
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

  const usdOnChain = data?.usdgUsd;
  const grant = data?.grant;
  return (
    <div className="space-y-6 px-5 pb-10 pt-9 sm:px-8">
      <PageHeader title="Wallet" description="Paper cash moves in Portfolio. Live USDG stays off until live_trading is on." />
      <Surface className="p-6">
        <p className="text-[13px] font-medium text-muted">Signed in as</p>
        <p className="mt-1 display text-[28px]">{displayName}</p>
        <p className="mt-4 break-all font-mono text-[13px] text-muted">{data?.wallet?.address ?? "No wallet yet."}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[16px] bg-canvas p-4">
            <p className="text-[13px] text-muted">On-chain USDG</p>
            <p className="num mt-1 text-[28px] font-semibold">
              {usdOnChain == null ? "—" : `$${usdOnChain.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
            </p>
          </div>
          <div className="rounded-[16px] bg-canvas p-4">
            <p className="text-[13px] text-muted">Live trading</p>
            <p className="mt-1 text-[16px]">{data?.liveEnabled ? "Enabled" : "Off (paper default)"}</p>
            <p className="mt-2 text-[13px] text-muted">
              {grant ? `Grant until ${new Date(grant.expiresAt ?? "").toLocaleDateString()}` : "No signer grant"}
            </p>
          </div>
        </div>
        {data?.wallet?.id ? (
          <Button
            className="mt-4"
            variant="ghost"
            onClick={async () => {
              await fetchApi(`/v1/wallets/${data.wallet!.id}/grant`, { method: "POST", body: JSON.stringify({ allowedContracts: [] }) });
              const next = await fetchApi<WalletData>("/v1/wallet");
              setData(next);
            }}
          >
            Create signer grant
          </Button>
        ) : null}
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" disabled title="Live USDG deposit is off">
            Deposit USDG
          </Button>
          <Button variant="ghost" disabled title="Live USDG withdraw is off">
            Withdraw USDG
          </Button>
        </div>
        <p className="mt-2 text-[13px] text-muted">Live deposit and withdraw stay disabled while live_trading is off.</p>
        {(data?.pending ?? []).length ? (
          <ul className="mt-4 space-y-2 text-[13px] text-muted">
            {data!.pending!.map((tx) => (
              <li key={tx.id} className="break-all font-mono">
                {tx.status} {tx.txHash}
              </li>
            ))}
          </ul>
        ) : null}
      </Surface>
      <Surface className="p-6">
        <p className="text-[13px] font-medium text-muted">Paper cash</p>
        <p className="mt-2 text-[15px] text-ink">Move paper USDG in a pocket. This is not on-chain money.</p>
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
