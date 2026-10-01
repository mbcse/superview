import { api } from "@/lib/api";
import { Surface } from "@/components/ui/surface";
import { HoldingRow } from "@/components/data/holding-row";

export default async function ReceiptPage({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;
  try {
    const data: any = await api(`/v1/receipts/${hash}`);
    const json = data.receipt.canonicalJson ?? {};
    const holdings = json.holdings ?? [];
    return (
      <div className="space-y-6">
        <p className="text-[13px] text-muted">{data.verified ? "Hash matches" : "Hash mismatch"}</p>
        <h1 className="display text-[28px] md:text-[32px]">{json.sentence ?? "Take"}</h1>
        <p className="break-all font-mono text-[12px] text-muted">{data.receipt.sha256}</p>
        <Surface className="p-5">
          {holdings.map((h: any) => (
            <HoldingRow key={h.tokenId} symbol={h.symbol ?? h.tokenId} weightBps={h.weightBps ?? 0} />
          ))}
        </Surface>
      </div>
    );
  } catch {
    return <p className="text-muted">Receipt not found.</p>;
  }
}
