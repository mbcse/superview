"use client";

import { Suspense, useEffect, useState } from "react";
import PocketsClient from "./ui";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { useAuth } from "@/components/auth-provider";
import { Skeleton } from "@/components/ui/surface";

export default function PocketsPage() {
  const { ready } = useAuth();
  const fetchApi = useAuthedFetch();
  const [pockets, setPockets] = useState<any[] | null>(null);
  useEffect(() => {
    if (!ready) return;
    fetchApi<{ pockets: any[] }>("/v1/pockets")
      .then((d) => setPockets(d.pockets ?? []))
      .catch(() => setPockets([]));
  }, [fetchApi, ready]);
  if (!pockets) return <Skeleton className="h-40" />;
  return (
    <Suspense>
      <PocketsClient pockets={pockets} />
    </Suspense>
  );
}
