import { signMeraIntents, type MeraIntent } from "./mera-live";

export type LiveInvestResult = {
  orderId?: string;
  status?: string;
  fills?: number;
  skipped?: number;
  queued?: boolean;
  needsClientSign?: boolean;
  intents?: MeraIntent[];
  error?: string;
};

export async function completeLiveInvest(
  fetchApi: <T>(path: string, init?: RequestInit) => Promise<T>,
  pocketId: string,
  amountUsd: number
): Promise<LiveInvestResult> {
  const prepared = await fetchApi<LiveInvestResult>(`/v1/pockets/${pocketId}/live-invest`, {
    method: "POST",
    body: JSON.stringify({ amountUsd })
  });
  if (!prepared.needsClientSign || !prepared.intents?.length || !prepared.orderId) return prepared;
  const signed = await signMeraIntents(prepared.intents);
  return fetchApi<LiveInvestResult>(`/v1/pockets/${pocketId}/live-confirm`, {
    method: "POST",
    body: JSON.stringify({ orderId: prepared.orderId, signed })
  });
}
