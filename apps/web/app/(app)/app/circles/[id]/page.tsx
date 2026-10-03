"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { Button } from "@/components/ui/button";
import { PageHeader, Surface } from "@/components/ui/surface";

export default function CircleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const fetchApi = useAuthedFetch();
  const [circle, setCircle] = useState<any>(null);
  const [member, setMember] = useState(false);
  useEffect(() => {
    fetchApi<{ circle: any; member: boolean }>(`/v1/circles/${id}`)
      .then((d) => {
        setCircle(d.circle);
        setMember(d.member);
      })
      .catch(() => setCircle(null));
  }, [fetchApi, id]);
  if (!circle) return <p className="p-8 text-muted">Loading circle…</p>;
  return (
    <div className="space-y-6 px-5 pb-10 pt-9 sm:px-8">
      <PageHeader title={circle.name} description={circle.topic} />
      <div className="flex gap-2">
        {member ? (
          <Button
            variant="ghost"
            onClick={async () => {
              await fetchApi(`/v1/circles/${id}/leave`, { method: "POST" });
              setMember(false);
            }}
          >
            Leave
          </Button>
        ) : (
          <Button
            variant="primary"
            onClick={async () => {
              await fetchApi(`/v1/circles/${id}/join`, { method: "POST" });
              setMember(true);
            }}
          >
            Join
          </Button>
        )}
      </div>
      <Surface className="p-5">
        <p className="text-[13px] text-muted">Members · {circle.members?.length ?? 0} / 12</p>
        <ul className="mt-3 space-y-1 text-[14px]">
          {(circle.members ?? []).map((m: any) => (
            <li key={m.id}>{m.user?.displayName ?? m.user?.handle}</li>
          ))}
        </ul>
      </Surface>
      <div className="space-y-3">
        {(circle.takes ?? []).map((t: any) => (
          <Link key={t.id} href={`/app/takes/${t.id}`} className="block">
            <Surface className="p-5">
              <p className="view text-[16px] font-medium">{t.revisions?.[0]?.sentence ?? "View"}</p>
              <p className="mt-2 text-[13px] text-muted">{t.author?.handle}</p>
            </Surface>
          </Link>
        ))}
        {!circle.takes?.length ? <p className="text-muted">No views in this circle yet.</p> : null}
      </div>
    </div>
  );
}
