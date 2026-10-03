"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { PageHeader, Surface } from "@/components/ui/surface";
import { DeltaPill } from "@/components/data/delta-pill";
import { fmtVs } from "@/lib/fmt";

type TakeRow = { id: string; sentence?: string; vsSpy: number | null };

export default function ProfilePage() {
  const fetchApi = useAuthedFetch();
  const [takes, setTakes] = useState<TakeRow[]>([]);
  useEffect(() => {
    fetchApi<{ takes: TakeRow[] }>("/v1/feed?tab=for-you")
      .then((d) => setTakes(d.takes ?? []))
      .catch(() => setTakes([]));
  }, [fetchApi]);
  const avg = takes.length ? takes.reduce((s, t) => s + (t.vsSpy ?? 0), 0) / takes.length : null;
  return (
    <div className="space-y-6">
      <PageHeader title="Profile" description="Track record vs S&P 500." />
      <Surface className="p-6">
        <p className="text-[13px] text-muted">Average vs S&P 500</p>
        <p className="num mt-1 text-[32px] font-medium">{avg == null ? "—" : fmtVs(avg)}</p>
        <DeltaPill className="mt-2" value={avg} points />
      </Surface>
      <Surface className="p-2">
        <Link href="/app/circles" className="flex items-center justify-between gap-3 border-b border-teal/10 px-4 py-3">
          <p className="text-[15px]">Circles</p>
          <span className="text-[13px] text-muted">Join a room</span>
        </Link>
        <Link href="/app/collections" className="flex items-center justify-between gap-3 px-4 py-3">
          <p className="text-[15px]">Collections</p>
          <span className="text-[13px] text-muted">Saved views</span>
        </Link>
      </Surface>
      <Surface className="p-2">
        {takes.map((t) => (
          <Link key={t.id} href={`/app/takes/${t.id}`} className="flex items-center justify-between gap-3 border-b border-teal/10 px-4 py-3 last:border-0">
            <p className="view min-w-0 truncate text-[15px] font-medium">{t.sentence ?? "View"}</p>
            <DeltaPill value={t.vsSpy} points />
          </Link>
        ))}
        {!takes.length ? <p className="p-4 text-muted">Publish a view to start a track record.</p> : null}
      </Surface>
    </div>
  );
}
