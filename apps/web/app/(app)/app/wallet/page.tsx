"use client";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { PageHeader, Surface } from "@/components/ui/surface";

export default function WalletPage() {
  const { walletAddress, displayName } = useAuth();
  return (
    <div className="space-y-6 px-5 pb-10 pt-9 sm:px-8">
      <PageHeader title="Wallet" description="Live USDG. Paper is in Pockets." />
      <Surface className="p-6">
        <p className="text-[13px] font-medium text-muted">Signed in as</p>
        <p className="mt-1 display text-[28px]">{displayName}</p>
        <p className="mt-4 break-all font-mono text-[13px] text-muted">{walletAddress ?? "No wallet yet."}</p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <div className="rounded-[16px] bg-canvas p-4">
            <p className="text-[13px] text-muted">USDG</p>
            <p className="num mt-1 text-[28px] font-semibold">$0.00</p>
          </div>
          <div className="rounded-[16px] bg-canvas p-4">
            <p className="text-[13px] text-muted">Status</p>
            <p className="mt-1 text-[16px]">Coming soon</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <Button variant="ghost" disabled>
            Deposit
          </Button>
          <Button variant="ghost" disabled>
            Withdraw
          </Button>
        </div>
      </Surface>
    </div>
  );
}
