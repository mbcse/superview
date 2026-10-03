import type { NextConfig } from "next";
import fs from "fs";
import path from "path";

/** Monorepo: Next only auto-loads `apps/web/.env*`; pull repo-root `.env` for Privy + API. */
function loadRootEnv() {
  const envPath = path.join(__dirname, "../../.env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
loadRootEnv();

const privyAppId = process.env.NEXT_PUBLIC_PRIVY_APP_ID ?? process.env.PRIVY_APP_ID ?? "";

const nextConfig: NextConfig = {
  transpilePackages: ["@takeandstake/shared", "remotion", "@remotion/player"],
  env: {
    NEXT_PUBLIC_API_ORIGIN: process.env.API_ORIGIN ?? "http://localhost:4000",
    NEXT_PUBLIC_PRIVY_APP_ID: privyAppId
  },
  async redirects() {
    return [
      { source: "/pockets", destination: "/app/pockets", permanent: false },
      { source: "/wallet", destination: "/app/wallet", permanent: false },
      { source: "/compose", destination: "/app/compose", permanent: false },
      { source: "/collections", destination: "/app/collections", permanent: false },
      { source: "/circles", destination: "/app/circles", permanent: false },
      { source: "/profile", destination: "/app/profile", permanent: false },
      { source: "/compare", destination: "/app/compare", permanent: false },
      { source: "/order", destination: "/app/order", permanent: false },
      { source: "/admin", destination: "/app/admin", permanent: false }
    ];
  }
};

export default nextConfig;
