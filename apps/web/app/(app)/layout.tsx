import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Gate } from "@/components/gate";
import { WalletCashProvider } from "@/components/wallet-cash";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <Gate>
      <WalletCashProvider>
        <AppShell>{children}</AppShell>
      </WalletCashProvider>
    </Gate>
  );
}
