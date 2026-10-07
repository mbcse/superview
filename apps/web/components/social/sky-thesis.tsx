import { cn } from "@/lib/cn";

export function SkyThesis({
  chart,
  prediction,
  size = "card"
}: {
  chart?: string | null;
  prediction?: string | null;
  size?: "card" | "page" | "share";
}) {
  const notes = (chart ?? "").trim();
  const result = (prediction ?? "").trim() || "Untitled view";
  const showNotes = notes.length > 0 && notes !== result;
  const ResultTag = size === "card" ? "p" : "h1";

  return (
    <div className={size === "card" ? "mt-3.5" : "mt-5"}>
      <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-teal">Sky</p>
      {showNotes ? (
        <p
          className={cn(
            "mt-2 whitespace-pre-wrap text-muted",
            size === "card" ? "line-clamp-4 text-[14px] leading-[1.45]" : "text-[15px] leading-[1.5]"
          )}
        >
          {notes}
        </p>
      ) : null}
      {showNotes ? (
        <p className="mt-3 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.08em] text-teal">
          <span aria-hidden className="h-px w-6 bg-teal/25" />
          Prediction
        </p>
      ) : null}
      <ResultTag
        className={cn(
          "font-medium text-ink",
          showNotes ? "mt-1.5" : "mt-2",
          size === "card" && "view text-[17px] leading-[1.35] tracking-[-0.02em]",
          size === "page" && "view text-[22px] leading-[1.3] tracking-[-0.02em] md:text-[28px]",
          size === "share" && "display text-[28px] md:text-[40px]"
        )}
      >
        {result}
      </ResultTag>
    </div>
  );
}
