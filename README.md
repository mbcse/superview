# SuperView

Write a view. An agent finds the companies, invests, and rebalances. Watch it play out vs the S&P 500.

The app opens on a feed of views. Each post is a researched basket of Robinhood Chain stock tokens, with live marks, comments, copy view, and invest. Paper is the default: live marks, a paper USDG ledger, and rebalance fills that actually move the book. Live USDG stays behind `live_trading` + `APP_MODE=live` + a Privy wallet signed with a P-256 authorization key.

Copy uses **Stock Tokens**, never “tokenized stocks.” This is not investment advice. Stock Tokens are economic exposure, not share ownership. They are not available to US persons or residents of the UK, Canada, Switzerland, the UAE, sanctioned countries, or other restricted jurisdictions.

## How it works

1. Write a one-sentence view.
2. The agent researches Robinhood Chain names (OpenAI + the catalog), sizes a basket, and publishes the view.
3. The feed shows vs S&P 500 live, holdings with ticking prices, comments, and invest.
4. An agent watches published views and, on paper, writes a new target then fills SELL/BUY legs in one transaction.

Paper is the default. Seed keeps `live_trading` off. Demo-user fallback is on in development; production stays off unless `ALLOW_DEMO_USER=true`. Seeded views ship with **illustrative** vs S&P history so period tabs can diverge; live quotes overlay that path. New views start from real marks only.

## Stack

| Piece | What |
| --- | --- |
| Web | Next.js 15 / React 19 on `:3000` |
| API | Express on `:4000` |
| Worker | BullMQ on Redis |
| Data | Prisma + Postgres. Embeddings are JSON arrays + cosine, not pgvector. |
| Auth | Privy |
| Chain | Robinhood Chain, 0x, Chainlink, Privy wallet RPC. Reads rotate across official + env + chainlist.org RPCs. |
| Research | OpenAI (`gpt-4o` / `gpt-4o-mini`) + Anthropic critic. No Parallel. |
| Quotes | Robinhood RHJ REST every 1s → Redis `quotes:last` → SSE `/v1/stream/prices` |

pnpm + Turborepo. Saans display + Geist body.

## Repo

```
apps/web       SuperView UI (feed, compose, take, portfolio)
apps/api       REST + SSE
apps/worker    quotes, valuations, agent jobs, catalog + corporate actions
packages/core  baskets, series, vs S&P, paper book, serializers
packages/ai    research, about fill, critic
packages/db    Prisma schema + seed
packages/chain Robinhood / 0x / oracles / Privy signing
```

## Setup

```bash
pnpm install
cp .env.example .env
docker compose up -d
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

API: `http://localhost:4000` · Web: `http://localhost:3000`

Needed for a useful local run: `OPENAI_API_KEY`. Privy, Anthropic, and 0x are optional until you want login, the critic, or live swaps.

## Railway (Hobby)

Hobby can run the backend. It is usage-billed ($5 plan + $5 included compute). This stack is always-on (1s quote ticks), so expect to spend past the included credit unless you keep replicas tiny.

**Use Docker, not Railpack.** The repo root is a pnpm monorepo with a Next app. Railpack from `/` will try to treat it as the web app. Config lives next to each service and points at `deploy/railway/Dockerfile`.

Hobby limits that matter: 50 services, 5 GB max volume, 2 custom domains, 8 GB / 8 vCPU per replica. Postgres here does **not** need pgvector.

### Layout

| | Services | When |
| --- | --- | --- |
| **Hobby default** | Railway Postgres + Redis + one `backend` service (`hobby.toml`, API+worker) | Stay closest to the $5 credit |
| Split | Postgres + Redis + `api` + `worker` | If research OOMs the combined box |

Keep the Next app on Vercel. Do not deploy `apps/web` on Hobby.

Replica sizes to start: backend (or each of api/worker) **0.5–1 vCPU, 1 GB**. Postgres and Redis at Railway defaults.

### Project setup

1. New Railway project → **Add Postgres** and **Add Redis**.
2. **New service from this repo.** Leave **Root Directory** empty.
3. **Config file** = `/deploy/railway/hobby.toml` (combined) or `/apps/api/railway.toml` plus a second service with `/apps/worker/railway.toml`.
4. Public domain on the API (or combined) service only.
5. Shared variables (use Railway references, private URLs when both services are in the same project):

```
NODE_ENV=production
APP_MODE=paper
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
WEB_ORIGIN=https://your-web.vercel.app
API_ORIGIN=https://${{RAILWAY_PUBLIC_DOMAIN}}
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
PRIVY_APP_ID=
PRIVY_APP_SECRET=
ADMIN_TOKEN=
```

Set `NEXT_PUBLIC_API_ORIGIN` on the web host to the same API URL.

Schema applies on API boot (`prisma db push`). Seed from your machine once, with the Railway `DATABASE_URL`:

```bash
pnpm db:seed
```

Health: `GET /health`. Worker-only services also serve `/health` on `PORT`.

Golden interpreter evals call the model when `OPENAI_API_KEY` is set; without a key they skip and the prompt-contract tests still pass.

## Day-1 spikes

```bash
pnpm spike
```

Runs 0x quote, Chainlink NVDA feed, and Privy sponsored-swap checks. Missing keys skip the related spike instead of failing the rest.
