import { api } from "@/lib/api";
import FeedClient from "./feed-client";

export default async function AppHome({ searchParams }: { searchParams: Promise<{ world?: string }> }) {
  const { world: worldRaw } = await searchParams;
  const world = worldRaw === "MEMES" ? "MEMES" : "STOCKS";
  let takes: unknown[] = [];
  try {
    const feed = await api<{ takes: unknown[] }>(`/v1/feed?tab=for-you&world=${world}`);
    takes = feed.takes ?? [];
  } catch {
    takes = [];
  }
  return <FeedClient initial={takes as never} />;
}
