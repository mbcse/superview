"use client";

import { useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { prfSupported } from "@/lib/mera";

export function PrivyLoginButtons({ disabled }: { disabled?: boolean }) {
  const privy = usePrivy();
  const { loginMera } = useAuth();
  const [meraBusy, setMeraBusy] = useState(false);
  const [meraErr, setMeraErr] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {prfSupported() ? (
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          disabled={disabled || meraBusy}
          onClick={() => {
            setMeraBusy(true);
            setMeraErr(null);
            void loginMera()
              .catch((e) => setMeraErr(e instanceof Error ? e.message : "Face ID failed"))
              .finally(() => setMeraBusy(false));
          }}
        >
          {meraBusy ? "Checking Face ID…" : "Continue with Face ID"}
        </Button>
      ) : null}
      {meraErr ? <p className="text-xs text-muted">{meraErr}</p> : null}
      <Button
        variant="primary"
        size="lg"
        className="w-full"
        disabled={disabled || !privy.ready}
        onClick={() => void privy.login({ loginMethods: ["email"] })}
      >
        Continue with email
      </Button>
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={disabled || !privy.ready}
        onClick={() => void privy.login({ loginMethods: ["google"] })}
      >
        Continue with Google
      </Button>
      <Button
        variant="secondary"
        size="lg"
        className="w-full"
        disabled={disabled || !privy.ready}
        onClick={() => void privy.login({ loginMethods: ["wallet"] })}
      >
        Continue with wallet
      </Button>
    </div>
  );
}
