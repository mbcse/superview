"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { PrivyProvider } from "@privy-io/react-auth";
import { useState, type ReactNode } from "react";
import { DemoAuthProvider, PrivyAuthProvider } from "./auth-provider";
import { PostHogProvider } from "./posthog-provider";
import { PriceStreamProvider } from "./social/price-stream";
import { StockSheetProvider } from "./social/stock-sheet";
import { ViewCommentsProvider } from "./social/view-chat";

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? "";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(() => new QueryClient());
  const tree = (
    <QueryClientProvider client={client}>
      <NuqsAdapter>
        <PostHogProvider>
          <PriceStreamProvider>
            <StockSheetProvider>
              <ViewCommentsProvider>{children}</ViewCommentsProvider>
            </StockSheetProvider>
          </PriceStreamProvider>
        </PostHogProvider>
      </NuqsAdapter>
    </QueryClientProvider>
  );

  if (!privyAppId) {
    return <DemoAuthProvider>{tree}</DemoAuthProvider>;
  }

  return (
    <PrivyProvider
      appId={privyAppId}
      config={{
        appearance: { theme: "light", accentColor: "#0E8F8F" },
        embeddedWallets: {
          ethereum: { createOnLogin: "users-without-wallets" },
          solana: { createOnLogin: "users-without-wallets" }
        },
        loginMethods: ["email", "wallet", "google"]
      }}
    >
      <PrivyAuthProvider>{tree}</PrivyAuthProvider>
    </PrivyProvider>
  );
}
