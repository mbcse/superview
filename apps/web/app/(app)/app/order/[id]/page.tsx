"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { PageHeader, Surface } from "@/components/ui/surface";
import { orderStatusLabel, skipReason } from "@/lib/fmt";

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const fetchApi = useAuthedFetch();
  const [order, setOrder] = useState<any>(null);
  useEffect(() => {
    fetchApi<{ order: any }>(`/v1/orders/${id}`)
      .then((d) => setOrder(d.order))
      .catch(() => setOrder(null));
  }, [fetchApi, id]);
  if (!order) return <p className="p-8 text-muted">Loading order…</p>;
  return (
    <div className="space-y-6 px-5 pb-10 pt-9 sm:px-8">
      <PageHeader
        title="Order"
        description={`${order.mode === "LIVE" ? "Live USDG" : "Paper"} · ${order.kind.toLowerCase()}`}
      />
      <Surface className="p-5">
        <p className="text-[13px] text-muted">Status</p>
        <p className="mt-1 text-[18px]">{orderStatusLabel(order.status)}</p>
      </Surface>
      <div className="grid gap-3">
        {(order.legs ?? []).map((leg: any) => (
          <Surface key={leg.id} className="p-5">
            <p className="font-mono text-[15px]">
              {leg.side} {leg.symbol}
            </p>
            <p className="mt-2 text-[13px] text-muted">
              {orderStatusLabel(leg.status)}
              {leg.skipReason ? ` · ${skipReason(leg.skipReason)}` : ""}
            </p>
            {leg.quotes?.[0] ? (
              <p className="mt-2 font-mono text-[13px] text-muted">Quote {Number(leg.quotes[0].price).toFixed(2)}</p>
            ) : null}
            {leg.txs?.[0]?.txHash ? (
              <p className="mt-2 break-all font-mono text-[12px] text-muted">{leg.txs[0].txHash}</p>
            ) : null}
          </Surface>
        ))}
      </div>
    </div>
  );
}
