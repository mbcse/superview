import { createRhClient, fetchZeroXQuote, readAggregator, RHNVDA_FEED, ROBINHOOD_CHAIN_ID, USDG_MAINNET } from "@takeandstake/chain";

function skip(name: string, reason: string) {
  console.log(`SKIP ${name}: ${reason}`);
}

async function spikeZeroX() {
  const key = process.env.ZEROX_API_KEY;
  if (!key) return skip("0x USDG→NVDA quote", "ZEROX_API_KEY missing");
  const nvda = process.env.NVDA_TOKEN_ADDRESS;
  if (!nvda) {
    console.log("0x spike needs NVDA_TOKEN_ADDRESS from catalog; fetching RH assets…");
  }
  const assets = await fetch("https://api.robinhood.com/rhj/assets");
  const json = (await assets.json()) as {
    assets?: Array<{
      tokenSymbol?: string;
      deployments?: Array<{ contractAddress?: string; chainId?: number }>;
    }>;
  };
  const token = json.assets?.find((a) => a.tokenSymbol === "NVDA");
  const contract = token?.deployments?.find((d) => d.chainId === ROBINHOOD_CHAIN_ID)?.contractAddress;
  if (!contract) return skip("0x quote", "could not resolve NVDA token");
  const sellAmount = String(10n ** 6n); // 1 USDG
  try {
    const quote = await fetchZeroXQuote({
      apiKey: key,
      chainId: ROBINHOOD_CHAIN_ID,
      sellToken: USDG_MAINNET,
      buyToken: contract,
      sellAmount,
      taker: "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
      firm: true
    });
    console.log("OK 0x quote", {
      buyToken: contract,
      buyAmount: quote.buyAmount,
      spender: quote.issues?.allowance?.spender
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("NOT_AUTHORIZED") || msg.includes("legal")) {
      console.log(
        "0x firm quote reached the API but was refused: Stock Token trading is blocked for this request (typically US IP / restricted taker). Retry from an allowed jurisdiction with a user wallet as taker."
      );
      console.log(msg.slice(0, 280));
      return;
    }
    throw e;
  }
}

async function spikeChainlink() {
  const rpc = process.env.ALCHEMY_RPC_URL || process.env.ROBINHOOD_RPC_URL || "https://rpc.mainnet.chain.robinhood.com";
  const client = createRhClient(rpc);
  const read = await readAggregator(client, RHNVDA_FEED);
  console.log("OK Chainlink RHNVDA", {
    answer: read.answer.toString(),
    updatedAt: read.updatedAt.toString(),
    stale: read.stale,
    reason: read.reason
  });
}

async function main() {
  console.log("takeAndStake day-1 spikes");
  await spikeChainlink().catch((e) => console.error("FAIL Chainlink", e));
  await spikeZeroX().catch((e) => console.error("FAIL 0x", e));
  await spikePrivy().catch((e) => console.error("FAIL Privy", e));
}
  const appId = process.env.PRIVY_APP_ID;
  const secret = process.env.PRIVY_APP_SECRET;
  if (!appId || !secret) {
    return skip("Privy sponsored swap", "PRIVY_APP_ID / PRIVY_APP_SECRET missing");
  }
  const auth = Buffer.from(`${appId}:${secret}`).toString("base64");
  const res = await fetch(`https://api.privy.io/v1/apps/${appId}`, {
    headers: {
      Authorization: `Basic ${auth}`,
      "privy-app-id": appId
    }
  });
  const body = await res.text();
  if (!res.ok) {
    console.error("FAIL Privy app lookup", res.status, body.slice(0, 300));
    return;
  }
  console.log("OK Privy app", res.status, "(sponsorship still needs dashboard toggle + a wallet_sendCalls test on 4663)");
}

async function main() {
  console.log("takeAndStake day-1 spikes");
  await spikeChainlink().catch((e) => console.error("FAIL Chainlink", e));
  await spikeZeroX().catch((e) => console.error("FAIL 0x", e));
  await spikeParallel().catch((e) => console.error("FAIL Parallel", e));
  await spikePrivy().catch((e) => console.error("FAIL Privy", e));
}

main();
