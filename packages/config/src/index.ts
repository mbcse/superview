import { z } from "zod";

const optionalUrl = z.string().url().optional().or(z.literal(""));

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  APP_MODE: z.enum(["paper", "live"]).default("paper"),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  API_PORT: z.coerce.number().default(4000),
  WEB_ORIGIN: z.string().url().default("http://localhost:3000"),
  API_ORIGIN: z.string().url().default("http://localhost:4000"),
  PRIVY_APP_ID: z.string().optional().default(""),
  PRIVY_APP_SECRET: z.string().optional().default(""),
  PRIVY_AUTHORIZATION_KEY: z.string().optional().default(""),
  ROBINHOOD_RPC_URL: z.string().url().default("https://rpc.mainnet.chain.robinhood.com"),
  ROBINHOOD_RPC_URLS: z.string().optional().default(""),
  ALCHEMY_RPC_URL: optionalUrl,
  ZEROX_API_KEY: z.string().optional().default(""),
  ANTHROPIC_API_KEY: z.string().optional().default(""),
  OPENAI_API_KEY: z.string().optional().default(""),
  FMP_API_KEY: z.string().optional().default(""),
  MANUS_API_KEY: z.string().optional().default(""),
  RESEARCH_MODEL: z.string().optional().default("gpt-4o"),
  FAST_MODEL: z.string().optional().default("gpt-4o-mini"),
  CRITIC_MODEL: z.string().optional().default("claude-haiku-4-5"),
  SOCIAL_MODEL: z.string().optional().default("claude-haiku-4-5"),
  BENCHMARK_SYMBOLS: z.string().optional().default("SPY,RHSPY,VOO,IVV"),
  PAPER_STARTING_USD: z.coerce.number().default(10_000),
  LIVE_MAX_TRADE_USD: z.coerce.number().default(2_000),
  LIVE_DAILY_CAP_USD: z.coerce.number().default(10_000),
  LIVE_ALLOWED_CONTRACTS: z.string().optional().default(""),
  PRIVY_WEBHOOK_SECRET: z.string().optional().default(""),
  ALCHEMY_WEBHOOK_TOKEN: z.string().optional().default(""),
  ORACLE_MAX_DEVIATION: z.coerce.number().default(0.015),
  R2_ACCOUNT_ID: z.string().optional().default(""),
  R2_ACCESS_KEY_ID: z.string().optional().default(""),
  R2_SECRET_ACCESS_KEY: z.string().optional().default(""),
  R2_BUCKET: z.string().optional().default("takeandstake-evidence"),
  RESEND_API_KEY: z.string().optional().default(""),
  SENTRY_DSN: z.string().optional().default(""),
  ADMIN_TOKEN: z.string().optional().default("dev-admin-token"),
  ALLOW_DEMO_USER: z.string().optional().default("")
});

export type Env = z.infer<typeof envSchema>;

function hostUrl(raw: string | undefined): string | undefined {
  const value = raw?.trim();
  if (!value) return undefined;
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withScheme);
    if (!url.hostname) return undefined;
    return url.origin;
  } catch {
    return undefined;
  }
}

export function resolvePublicUrl(
  explicit: string | undefined,
  hosts: Array<string | undefined>,
  fallback: string
): string {
  return hostUrl(explicit) ?? hosts.map(hostUrl).find(Boolean) ?? fallback;
}

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const next = { ...source };
  next.API_ORIGIN = resolvePublicUrl(source.API_ORIGIN, [source.RAILWAY_PUBLIC_DOMAIN, source.RAILWAY_STATIC_URL], "http://localhost:4000");
  next.WEB_ORIGIN = resolvePublicUrl(source.WEB_ORIGIN, [], "http://localhost:3000");
  const parsed = envSchema.safeParse(next);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function requireKey(env: Env, key: keyof Env, purpose: string): string {
  const value = env[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing ${String(key)} required for ${purpose}`);
  }
  return value;
}

export function isPaperMode(env: Env = loadEnv()): boolean {
  return env.APP_MODE === "paper";
}

export function isLiveMode(env: Env = loadEnv()): boolean {
  return env.APP_MODE === "live";
}
