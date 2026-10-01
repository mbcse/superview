import { api } from "@/lib/api";
import FeedClient from "./feed-client";

export default async function AppHome() {
  let takes: unknown[] = [];
  try {
    const feed = await api<{ takes: unknown[] }>("/v1/feed?tab=for-you");
    takes = feed.takes ?? [];
  } catch {
    takes = [];
  }
  return <FeedClient initial={takes as never} />;
}
