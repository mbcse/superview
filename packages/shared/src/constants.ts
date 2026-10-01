export const TOTAL_BPS = 10_000;
export const ISSUER_CAP_BPS = 2_000;
export const SECTOR_CAP_BPS = 4_500;
export const ACTION_CAP_BPS = 4_500;
export const MIN_HOLDING_BPS = 300;
export const MIN_HOLDINGS = 5;
export const MAX_HOLDINGS = 12;
export const DEFAULT_CASH_BPS = 500;
export const MAX_CASH_BPS = 1_000;
export const SINGLE_TICKER_ANCHOR_BPS = 3_000;
export const DIRECT_MIN_BPS = 4_000;
export const INDIRECT_MAX_BPS = 4_500;
export const SHARED_MAX_BPS = 2_500;
export const HEDGE_MAX_BPS = 1_000;
export const TAKE_MAX_CASH_BPS = 3_000;
export const MIN_LEG_USD = 5;
export const ORACLE_QUOTE_TOLERANCE = 0.02;
export const DEFAULT_SLIPPAGE_BPS = 100;
export const MAX_SLIPPAGE_BPS = 300;
export const MIN_THESIS_ACTION_BPS = 7_000;
export const USDG_DECIMALS = 6;
export const TOKEN_DECIMALS = 18;

export const RESTRICTED_COUNTRIES = [
  "US",
  "GB",
  "CA",
  "CH",
  "AE"
] as const;

export const STOCK_TOKEN_COPY =
  "Stock Tokens are economic exposure, not share ownership. This is not investment advice.";
