import { api } from "@/lib/api";
import TakeClient from "./ui";

export default async function TakePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const data = await api(`/v1/takes/${id}`);
    return <TakeClient data={data} />;
  } catch {
    return <p className="text-muted">Take not found. Is the API running?</p>;
  }
}
