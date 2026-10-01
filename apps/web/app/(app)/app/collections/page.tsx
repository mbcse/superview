"use client";

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
      <PageHeader title="Collections" description="Saved takes." />
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-sm" value={title} onChange={(e) => setTitle(e.target.value)} name="title" />
        <Button
          onClick={async () => {
            await fetchApi("/v1/collections", { method: "POST", body: JSON.stringify({ title }) });
            location.reload();
          }}
        >
          New collection
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.length === 0 && <p className="text-muted">No collections yet.</p>}
        {rows.map((c) => (
          <Surface key={c.id} className="p-5">
            <h2 className="display text-[20px]">{c.title}</h2>
            <p className="mt-2 text-[13px] text-muted">
              {c.owner?.handle} · {c.items?.length ?? 0} takes
            </p>
          </Surface>
        ))}
      </div>
    </div>
  );
}
