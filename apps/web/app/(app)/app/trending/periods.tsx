"use client";

import { useRouter } from "next/navigation";
import { SegmentedTabs } from "@/components/data/segmented-tabs";

const PERIODS = ["1D", "1W", "1M", "All"] as const;

export function SegmentedTabsClient({ period, q }: { period: string; q?: string }) {
  const router = useRouter();
  const extra = q?.trim() ? `&q=${encodeURIComponent(q.trim())}` : "";
  return (
    <SegmentedTabs
      options={PERIODS}
      value={period}
      onChange={(v) => router.push(`/app/trending?period=${v}${extra}`)}
      layoutId="trend-period"
    />
  );
}
