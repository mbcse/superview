"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { Button } from "@/components/ui/button";
import { PageHeader, Surface } from "@/components/ui/surface";

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const fetchApi = useAuthedFetch();
  const [collection, setCollection] = useState<any>(null);
  const [following, setFollowing] = useState(false);
  useEffect(() => {
    fetchApi<{ collection: any; following: boolean }>(`/v1/collections/${id}`)
      .then((d) => {
        setCollection(d.collection);
        setFollowing(d.following);
      })
      .catch(() => setCollection(null));
  }, [fetchApi, id]);
  if (!collection) return <p className="p-8 text-muted">Loading collection…</p>;
  return (
    <div className="space-y-6 px-5 pb-10 pt-9 sm:px-8">
      <PageHeader title={collection.title} description={collection.description || `Saved by ${collection.owner?.handle}`} />
      <Button
        variant={following ? "ghost" : "primary"}
        onClick={async () => {
          await fetchApi(`/v1/collections/${id}/follow`, { method: "POST" });
          setFollowing(true);
        }}
      >
        {following ? "Following" : "Follow"}
      </Button>
      <div className="space-y-3">
        {(collection.items ?? []).map((item: any) => (
          <Link key={item.id} href={`/app/takes/${item.takeId}`} className="block">
            <Surface className="p-5">
              <p className="view text-[16px] font-medium">{item.take?.revisions?.[0]?.sentence ?? "View"}</p>
              {item.note ? <p className="mt-2 text-[13px] text-muted">{item.note}</p> : null}
            </Surface>
          </Link>
        ))}
        {!collection.items?.length ? <p className="text-muted">No saved views yet.</p> : null}
      </div>
    </div>
  );
}
