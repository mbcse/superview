"use client";

import { useEffect, useState } from "react";
import { Sparkle, Pulse, Check, PaperPlaneTilt } from "@phosphor-icons/react";
import { useAuthedFetch } from "@/components/use-authed-fetch";
import { EmptyState } from "@/components/ui/surface";

type Note = { id: string; type: string; payload: { post?: string; decision?: string }; readAt: string | null; createdAt: string };

function kindOf(type: string) {
  const t = type.toLowerCase();
  if (t.includes("agent") || t.includes("rebalanc")) return { icon: Sparkle, wrap: "bg-aqua/15", tone: "text-aqua", label: "Agent" };
  if (t.includes("trend")) return { icon: Pulse, wrap: "bg-sky/15", tone: "text-sky-deep", label: "Trending" };
  if (t.includes("invest") || t.includes("fill")) return { icon: Check, wrap: "bg-gain/10", tone: "text-gain", label: "Invested" };
  return { icon: PaperPlaneTilt, wrap: "bg-teal/10", tone: "text-teal", label: "Published" };
}

export default function NotificationsPage() {
  const fetchApi = useAuthedFetch();
  const [rows, setRows] = useState<Note[]>([]);
  useEffect(() => {
    fetchApi<{ notifications: Note[] }>("/v1/notifications")
      .then((d) => setRows(d.notifications ?? []))
      .catch(() => setRows([]));
  }, [fetchApi]);

  const today = new Date().toDateString();
  const todayRows = rows.filter((n) => new Date(n.createdAt).toDateString() === today);
  const earlier = rows.filter((n) => new Date(n.createdAt).toDateString() !== today);

  return (
    <div>
      <h1 className="display text-[28px] text-ink md:text-[32px]">Notifications</h1>
      {rows.length === 0 ? (
        <EmptyState title="No updates yet." body="When the agent acts or your views move, you’ll hear about it here." />
      ) : (
        [
          { title: "Today", items: todayRows },
          { title: "Earlier", items: earlier }
        ]
          .filter((g) => g.items.length > 0)
          .map((g) => (
            <section key={g.title} className="mt-8">
              <h2 className="text-[13px] font-medium text-muted">{g.title}</h2>
              <ul className="glass-card mt-3 divide-y divide-teal/10 rounded-3xl px-2">
                {g.items.map((n) => {
                  const s = kindOf(n.type);
                  const Icon = s.icon;
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-4 rounded-2xl px-4 py-4 text-left hover:bg-mist/50"
                        onClick={() => void fetchApi(`/v1/notifications/${n.id}/read`, { method: "POST" })}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${s.wrap}`}>
                          <Icon size={16} className={s.tone} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[15px] text-ink">{n.payload?.post ?? n.payload?.decision ?? n.type}</p>
                          <p className="mt-0.5 text-[12px] text-muted">{n.type}</p>
                        </div>
                        {!n.readAt ? <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-aqua" aria-label="Unread" /> : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))
      )}
    </div>
  );
}
