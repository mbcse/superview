"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Surface } from "@/components/ui/surface";

export default function CollectionsPage() {
  const fetchApi = useAuthedFetch();
  const [title, setTitle] = useState("My 2030 theses");
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    fetchApi<{ collections: any[] }>("/v1/collections")
      .then((d) => setRows(d.collections ?? []))
      .catch(() => setRows([]));
  }, [fetchApi]);
  return (
    <div className="space-y-6 px-5 pb-10 pt-9 sm:px-8">
      <PageHeader title="Collections" description="Saved views." />
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-sm" value={title} onChange={(e) => setTitle(e.target.value)} name="title" />
        <Button
          onClick={async () => {
            const r = await fetchApi<{ collection: { id: string } }>("/v1/collections", {
              method: "POST",
              body: JSON.stringify({ title })
            });
            if (r.collection?.id) location.href = `/app/collections/${r.collection.id}`;
          }}
        >
          New collection
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.length === 0 && <p className="text-muted">No collections yet.</p>}
        {rows.map((c) => (
          <Link key={c.id} href={`/app/collections/${c.id}`}>
            <Surface className="p-5">
              <h2 className="display text-[20px]">{c.title}</h2>
              <p className="mt-2 text-[13px] text-muted">
                {c.owner?.handle} · {c.items?.length ?? 0} views
              </p>
            </Surface>
          </Link>
        ))}
      </div>
    </div>
  );
}
