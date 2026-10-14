"use client";

import { useState } from "react";
import { useDepositFunds } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { useWalletCash } from "@/components/wallet-cash";

function PrivyAddCash({ amount, fullWidth, label }: { amount: string; fullWidth?: boolean; label: string }) {
  const { depositFunds } = useDepositFunds();
  const { refresh } = useWalletCash();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  return (
    <div>
      <Button
        variant="primary"
        fullWidth={fullWidth}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setErr("");
          void depositFunds({
            destination: { asset: "usdc", chain: "base" },
            fiat: {
              source: { assets: ["usd"], defaultAsset: "usd" },
              defaultAmount: amount
            },
            crypto: { source: { mode: "all" } }
          })
            .then(() => refresh())
            .catch(() => setErr("Couldn’t start funding."))
            .finally(() => setBusy(false));
        }}
      >
        {busy ? "Opening…" : label}
      </Button>
      {err ? <p className="mt-2 text-[13px] text-down">{err}</p> : null}
    </div>
  );
}

export function AddCashButton({ amount = "5", fullWidth, label = "Add cash" }: { amount?: string; fullWidth?: boolean; label?: string }) {
  if (!process.env.NEXT_PUBLIC_PRIVY_APP_ID) {
    return (
      <Button variant="primary" fullWidth={fullWidth} disabled>
        Sign in to add cash
      </Button>
    );
  }
  return <PrivyAddCash amount={amount} fullWidth={fullWidth} label={label} />;
}
