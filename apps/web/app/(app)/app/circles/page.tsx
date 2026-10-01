"use client";

import { useEffect, useState } from "react";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PageHeader, Surface } from "@/components/ui/surface";

export default function CirclesPage() {
  const fetchApi = useAuthedFetch();
  const [name, setName] = useState("Robotics skeptics");
  const [topic, setTopic] = useState("Industrial robots vs humanoids");
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => {
    fetchApi<{ circles: any[] }>("/v1/circles")
      .then((d) => setRows(d.circles ?? []))
      .catch(() => setRows([]));
  }, [fetchApi]);
  return (
    <div className="space-y-6 px-5 pb-10 pt-9 sm:px-8">
      <PageHeader title="Circles" description="Topic rooms." />
      <div className="flex flex-wrap gap-2">
        <Input className="max-w-xs" value={name} onChange={(e) => setName(e.target.value)} name="name" />
        <Input className="max-w-sm" value={topic} onChange={(e) => setTopic(e.target.value)} name="topic" />
        <Button
          onClick={async () => {
            await fetchApi("/v1/circles", { method: "POST", body: JSON.stringify({ name, topic }) });
            location.reload();
          }}
        >
          Open circle
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {rows.length === 0 && <p className="text-muted">No circles yet.</p>}
        {rows.map((c) => (
          <Surface key={c.id} className="p-5">
            <h2 className="display text-[20px]">{c.name}</h2>
            <p className="mt-2 text-[14px] text-muted">{c.topic}</p>
            <p className="num mt-3 text-[13px] text-muted">{c.members?.length ?? 0} / 12</p>
          </Surface>
        ))}
      </div>
    </div>
  );
}
