"use client";

import { useRouter } from "next/navigation";
import { SegmentedTabs } from "@/components/data/segmented-tabs";

const PERIODS = ["1D", "1W", "1M", "All"] as const;

export function SegmentedTabsClient({ period }: { period: string }) {
  const router = useRouter();
  return (
    <SegmentedTabs
      options={PERIODS}
      value={period}
      onChange={(v) => router.push(`/app/trending?period=${v}`)}
      layoutId="trend-period"
    />
  );
}
