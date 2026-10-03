"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { Button } from "@/components/ui/button";
import { PageHeader, Surface } from "@/components/ui/surface";

export default function WalletPage() {
  const { displayName } = useAuth();
  const fetchApi = useAuthedFetch();
  const [data, setData] = useState<any>(null);
  useEffect(() => {
    fetchApi("/v1/wallet")
      .then(setData)
      .catch(() => setData(null));
  }, [fetchApi]);
  const usd = data?.usdgUsd;
  const grant = data?.grant;
  return (
    <div className="space-y-6 px-5 pb-10 pt-9 sm:px-8">
      <PageHeader title="Wallet" description="Live USDG is off until you turn the flag on. Paper lives in Portfolio." />
      <Surface className="p-6">
        <p className="text-[13px] font-medium text-muted">Signed in as</p>
        <p className="mt-1 display text-[28px]">{displayName}</p>
        <p className="mt-4 break-all font-mono text-[13px] text-muted">{data?.wallet?.address ?? "No wallet yet."}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[16px] bg-canvas p-4">
            <p className="text-[13px] text-muted">On-chain USDG</p>
            <p className="num mt-1 text-[28px] font-semibold">
              {usd == null ? "—" : `$${usd.toLocaleString("en-US", { maximumFractionDigits: 2 })}`}
            </p>
          </div>
          <div className="rounded-[16px] bg-canvas p-4">
            <p className="text-[13px] text-muted">Live trading</p>
            <p className="mt-1 text-[16px]">{data?.liveEnabled ? "Enabled" : "Off (paper default)"}</p>
            <p className="mt-2 text-[13px] text-muted">
              {grant ? `Grant until ${new Date(grant.expiresAt).toLocaleDateString()}` : "No signer grant"}
            </p>
          </div>
        </div>
        {data?.wallet?.id ? (
          <Button
            className="mt-4"
            variant="ghost"
            onClick={async () => {
              await fetchApi(`/v1/wallets/${data.wallet.id}/grant`, { method: "POST", body: JSON.stringify({ allowedContracts: [] }) });
              const next = await fetchApi("/v1/wallet");
              setData(next);
            }}
          >
            Create signer grant
          </Button>
        ) : null}
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" disabled>
            Deposit
          </Button>
          <Button variant="ghost" disabled>
            Withdraw
          </Button>
        </div>
        {(data?.pending ?? []).length ? (
          <ul className="mt-4 space-y-2 text-[13px] text-muted">
            {data.pending.map((tx: any) => (
              <li key={tx.id} className="break-all font-mono">
                {tx.status} {tx.txHash}
              </li>
            ))}
          </ul>
        ) : null}
      </Surface>
    </div>
  );
}
