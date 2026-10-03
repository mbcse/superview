# SuperView

Write a view. An agent finds the companies, invests, and rebalances. Watch it play out vs the S&P 500.

The app opens on a feed of views. Each post is a researched basket of Robinhood Chain stock tokens, with live marks, comments, copy view, and invest. Paper is the default: live marks, a paper USDG ledger, and rebalance fills that actually move the book. Live USDG stays behind `live_trading` + `APP_MODE=live` + a Privy wallet signed with a P-256 authorization key.

Copy uses **Stock Tokens**, never “tokenized stocks.” This is not investment advice. Stock Tokens are economic exposure, not share ownership. They are not available to US persons or residents of the UK, Canada, Switzerland, the UAE, sanctioned countries, or other restricted jurisdictions.

## How it works

1. Write a one-sentence view.
2. The agent researches Robinhood Chain names (OpenAI + the catalog), sizes a basket, and publishes the view.
3. The feed shows vs S&P 500 live, holdings with ticking prices, comments, and invest.
4. An agent watches published views and, on paper, writes a new target then fills SELL/BUY legs in one transaction.

Paper is the default. Seed keeps `live_trading` off. Demo-user fallback is on in development; production stays off unless `ALLOW_DEMO_USER=true`.

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

Golden interpreter evals call the model when `OPENAI_API_KEY` is set; without a key they skip and the prompt-contract tests still pass.

## Day-1 spikes

```bash
pnpm spike
```

Runs 0x quote, Chainlink NVDA feed, and Privy sponsored-swap checks. Missing keys skip the related spike instead of failing the rest.
