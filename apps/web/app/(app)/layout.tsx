import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Gate } from "@/components/gate";

export default function ProductLayout({ children }: { children: ReactNode }) {
  return (
    <Gate>
      <AppShell>{children}</AppShell>
    </Gate>
  );
}
