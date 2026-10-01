export function fmtPct(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n * 100).toFixed(2)}%`;
}

export function fmtVs(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(2)}%`;
}

export function fmtNum(n: number | null | undefined, digits = 2) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

export function fmtPx(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtUsd(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return "—";
  const sign = n < 0 ? "−" : "";
  return `${sign}$${Math.abs(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtPooled(n: number | null | undefined) {
  if (n == null || Number.isNaN(n)) return null;
  if (Math.abs(n) >= 10_000) {
    const k = n / 1000;
    const digits = Number.isInteger(k) ? 0 : 1;
    return `$${k.toLocaleString(undefined, { maximumFractionDigits: digits })}K`;
  }
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: n % 1 ? 0 : 0 })}`;
}

export function changeTone(n: number | null | undefined): "up" | "down" | "flat" {
  if (n == null || n === 0 || Number.isNaN(n)) return "flat";
  return n > 0 ? "up" : "down";
}

export function skipReason(code?: string) {
  switch (code) {
    case "no_quote":
      return "Couldn’t get a live quote";
    case "no_feed":
      return "Price isn’t available";
    case "oracle_offside":
      return "Quote didn’t match the market price";
    case "dust":
      return "Below minimum trade size";
    default:
      return code ? code.replace(/_/g, " ") : "Skipped";
  }
}

export function orderStatusLabel(status?: string) {
  switch (status) {
    case "FILLED":
      return "Filled";
    case "PARTIAL":
      return "Partially filled";
    case "FAILED":
      return "Nothing filled";
    case "SUBMITTING":
      return "Working…";
    default:
      return status ?? "—";
  }
}

export function tick(sym: string) {
  return (sym || "").replace(/^RH/, "");
}

export function fmtAgo(iso?: string | Date | null) {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const t = d.getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 45) return "now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d`;
  const week = Math.round(day / 7);
  if (week < 5) return `${week}w`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "http://localhost:4000";
