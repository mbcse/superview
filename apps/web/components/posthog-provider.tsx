"use client";

import { Suspense, useEffect, type ReactNode } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider, usePostHog } from "posthog-js/react";
import { useAuth } from "./auth-provider";

export const POSTHOG_KEY =
  process.env.NEXT_PUBLIC_POSTHOG_KEY ?? "phc_5918n4s3UPJOIawjTciuy5YrGdotlvB1dTpoZFPTdkM";
export const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://us.i.posthog.com";

let didInit = false;

function initPostHog() {
  if (didInit || typeof window === "undefined" || !POSTHOG_KEY) return;
  didInit = true;
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    ui_host: "https://us.posthog.com",
    person_profiles: "identified_only",
    capture_pageview: false,
    capture_pageleave: true,
    autocapture: true,
    persistence: "localStorage+cookie",
    disable_session_recording: false,
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: "[data-ph-mask]"
    },
    loaded: (ph) => {
      ph.startSessionRecording();
    }
  });
}

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ph = usePostHog();

  useEffect(() => {
    if (!pathname || !ph) return;
    let url = window.origin + pathname;
    const q = searchParams.toString();
    if (q) url += `?${q}`;
    ph.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams, ph]);

  return null;
}

function PostHogIdentify() {
  const ph = usePostHog();
  const { ready, authenticated, displayName, handle, walletAddress } = useAuth();

  useEffect(() => {
    if (!ready || !ph) return;
    if (!authenticated) {
      ph.reset();
      return;
    }
    ph.identify(walletAddress || handle, {
      name: displayName,
      handle,
      wallet: walletAddress
    });
  }, [ready, authenticated, displayName, handle, walletAddress, ph]);

  return null;
}

export function PostHogProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    initPostHog();
  }, []);

  return (
    <PHProvider client={posthog}>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      <PostHogIdentify />
      {children}
    </PHProvider>
  );
}
