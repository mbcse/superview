import { createPublicClient, type Address, type PublicClient } from "viem";
import { aggregatorV3Abi, erc8056Abi } from "./abi.js";
import { robinhoodChain } from "./constants.js";
import { createRhTransport } from "./rpc-pool.js";

export function createRhClient(rpcUrl?: string | readonly string[]): PublicClient {
  return createPublicClient({
    chain: robinhoodChain,
    transport: createRhTransport(rpcUrl)
  });
}

export type FeedRead = {
  roundId: bigint;
  answer: bigint;
  updatedAt: bigint;
  stale: boolean;
  reason?: string;
};

export async function readAggregator(
  client: ReturnType<typeof createRhClient>,
  feed: Address,
  heartbeatSeconds = 86_400
): Promise<FeedRead> {
  const [roundId, answer, , updatedAt] = await client.readContract({
    address: feed,
    abi: aggregatorV3Abi,
    functionName: "latestRoundData"
  });
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (answer <= 0n) {
    return { roundId, answer, updatedAt, stale: true, reason: "non-positive answer" };
  }
  if (now - updatedAt > BigInt(heartbeatSeconds)) {
    return { roundId, answer, updatedAt, stale: true, reason: "heartbeat exceeded" };
  }
  return { roundId, answer, updatedAt, stale: false };
}

export async function isOraclePaused(
  client: ReturnType<typeof createRhClient>,
  token: Address
): Promise<boolean> {
  try {
    return await client.readContract({
      address: token,
      abi: erc8056Abi,
      functionName: "oraclePaused"
    });
  } catch {
    return false;
  }
}

export function feedAnswerToUsd(answer: bigint, decimals = 8): number {
  return Number(answer) / 10 ** decimals;
}
