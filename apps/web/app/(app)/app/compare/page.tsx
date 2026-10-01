import { api } from "@/lib/api";
import { Surface } from "@/components/ui/surface";
import { HoldingRow } from "@/components/data/holding-row";

export default async function ComparePage({ searchParams }: { searchParams: Promise<{ a?: string; b?: string }> }) {
  const { a, b } = await searchParams;
  if (!a) return <p className="text-muted">Open a take and choose Compare.</p>;
  let left: any = null;
  let right: any = null;
  try {
    left = await api(`/v1/takes/${a}`);
  } catch {}
  if (b) {
    try {
      right = await api(`/v1/takes/${b}`);
    } catch {}
  }
  const lh = left?.take?.revisions?.[0]?.target?.holdings ?? [];
  const rh = right?.take?.revisions?.[0]?.target?.holdings ?? [];
  return (
    <div className="grid gap-4 px-5 pb-10 pt-9 md:grid-cols-2 sm:px-8">
      <Book title={left?.take?.revisions?.[0]?.sentence ?? "Original"} holdings={lh} />
      <Book title={right ? right.take?.revisions?.[0]?.sentence : "Counter"} holdings={rh} empty={!right} />
    </div>
  );
}

function Book({ title, holdings, empty }: { title: string; holdings: any[]; empty?: boolean }) {
  return (
    <Surface className="p-5">
      <h2 className="display text-[20px]">{title}</h2>
      {empty ? <p className="mt-4 text-muted">Write a counter from the take.</p> : null}
      <div className="mt-3">
        {holdings.map((h) => (
          <HoldingRow key={h.id} symbol={h.token.symbol} weightBps={h.weightBps} />
        ))}
      </div>
    </Surface>
  );
}
