import { Surface } from "@/components/ui/surface";
import { PageHeader } from "@/components/ui/surface";

export default function OrderPage() {
  return (
    <div className="space-y-6 px-5 pb-10 pt-9 sm:px-8">
      <PageHeader title="Order review" description="Quote, fill, skip." />
      <div className="grid gap-3 sm:grid-cols-2">
        {[
          ["Name", "Stock token"],
          ["USDG in", "Paper or live cash"],
          ["Quote", "Exchange quote, or skipped"],
          ["Mark", "vs S&P 500"]
        ].map(([k, v]) => (
          <Surface key={k} className="p-5">
            <p className="text-[13px] text-muted">{k}</p>
            <p className="mt-1 text-[16px]">{v}</p>
          </Surface>
        ))}
      </div>
    </div>
  );
}
