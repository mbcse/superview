import Link from "next/link";
import { DeltaPill } from "@/components/data/delta-pill";
import { tick } from "@/lib/fmt";

export function LeaderboardRow({
  rank,
  take
}: {
  rank: number;
  take: {
    id: string;
    sentence?: string;
    author: string;
    vsSpy: number | null;
    backers?: number;
    holdings?: Array<{ symbol: string }>;
  };
}) {
  return (
    <Link href={`/app/takes/${take.id}`} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-3 border-b border-teal/10 py-3 last:border-0">
      <span className="figure text-[18px] text-teal">{rank.toString().padStart(2, "0")}</span>
      <div className="min-w-0">
        <p className="view truncate text-[15px] font-medium leading-[1.3]">{take.sentence ?? "View"}</p>
        <p className="mt-0.5 truncate text-[12px] text-muted">
          {take.author}
          {take.holdings?.length ? ` · ${take.holdings.slice(0, 4).map((h) => tick(h.symbol)).join(" ")}` : ""}
          {take.backers ? ` · ${take.backers} invested` : ""}
        </p>
      </div>
      <DeltaPill value={take.vsSpy} points />
    </Link>
  );
}
