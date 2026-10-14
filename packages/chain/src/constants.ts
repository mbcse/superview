import { defineChain } from "viem";

export const ROBINHOOD_CHAIN_ID = 4663;
export const ROBINHOOD_TESTNET_CHAIN_ID = 46630;
export const BASE_CHAIN_ID = 8453;
export const MONAD_CHAIN_ID = 143;

export const USDG_MAINNET = "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168" as const;
export const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const;
export const AUSD_MONAD = "0x00000000eFE302BEAA2b3e6e1b18d08D69a9012a" as const;
export const WETH_MAINNET = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as const;
export const USDG_TESTNET = "0x7E955252E15c84f5768B83c41a71F9eba181802F" as const;

export const RHNVDA_FEED = "0x379EC4f7C378F34a1B47E4F3cbeBCbAC3E8E9F15" as const;
export const RHSPY_FEED = "0x319724394D3A0e3669269846abE664Cd621f9f6A" as const;

export const CHAINLINK_FEEDS_DIRECTORY =
  "https://reference-data-directory.vercel.app/feeds-robinhood-mainnet.json";

export const RH_ASSETS_URL = "https://api.robinhood.com/rhj/assets";
export const RH_PRICES_URL = "https://api.robinhood.com/rhj/prices";
export const RH_CORP_ACTIONS_URL = "https://api.robinhood.com/rhj/corporate-actions";

export const ZEROX_SWAP_URL = "https://api.0x.org/swap/allowance-holder/quote";
export const ZEROX_PRICE_URL = "https://api.0x.org/swap/allowance-holder/price";

export const robinhoodChain = defineChain({
  id: ROBINHOOD_CHAIN_ID,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        "https://rpc.mainnet.chain.robinhood.com",
        "https://sequencer.mainnet.chain.robinhood.com",
        "https://triport.io/rpc/robinhood/public"
      ]
    }
  },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://robinhoodchain.blockscout.com" }
  }
});

export const baseChain = defineChain({
  id: BASE_CHAIN_ID,
  name: "Base",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: { default: { http: ["https://mainnet.base.org"] } },
  blockExplorers: { default: { name: "Basescan", url: "https://basescan.org" } }
});

export const monadChain = defineChain({
  id: MONAD_CHAIN_ID,
  name: "Monad",
  nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.monad.xyz"] } },
  blockExplorers: { default: { name: "Monadvision", url: "https://monadvision.com" } }
});

export function evmChainOf(chainId: number) {
  if (chainId === BASE_CHAIN_ID) return baseChain;
  if (chainId === MONAD_CHAIN_ID) return monadChain;
  return robinhoodChain;
}
