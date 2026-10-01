"use client";

import { usePrivy } from "@privy-io/react-auth";
import { Button } from "@/components/ui/button";

export function PrivyLoginButtons({ disabled }: { disabled?: boolean }) {
  const privy = usePrivy();

  return (
    <div className="flex flex-col gap-3">
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
