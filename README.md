# SuperView

Write a view. An agent finds the companies, invests, and rebalances. Watch it play out vs the S&P 500.

The app opens on a LinkedIn-style feed of views. Each post is a researched basket of Robinhood Chain stock tokens, with live marks, comments, copy view, and invest. Paper uses live markets without live money. Real spends USDG from a Privy wallet.

Copy uses **Stock Tokens**, never “tokenized stocks.” This is not investment advice. Stock Tokens are economic exposure, not share ownership. They are not available to US persons or residents of the UK, Canada, Switzerland, the UAE, sanctioned countries, or other restricted jurisdictions.

## How it works

1. Write a one-sentence view.
2. The agent researches Robinhood Chain names, sizes a basket, and publishes the view.
3. The feed shows vs S&P 500 live, holdings with ticking prices, comments, and invest.
4. An agent watches published views and rebalances as the story changes.

Paper is the default. Live has daily and per-trade caps.

## Stack

| Piece | What |
| --- | --- |
| Web | Next.js 15 / React 19 on `:3000` |
| API | Express on `:4000` |
| Worker | BullMQ on Redis |
| Data | Prisma + Postgres (pgvector) |
| Auth | Privy |
| Chain | Robinhood Chain, 0x, Chainlink |
| Research | OpenAI (`gpt-4o` / `gpt-4o-mini`) + Anthropic critic |
| Quotes | Robinhood RHJ REST every 1s → Redis `quotes:last` → SSE `/v1/stream/prices` |

pnpm + Turborepo. Geist sans only (no serif, no italics).

## Repo

```
apps/web       SuperView UI (feed, compose, take, portfolio)
apps/api       REST + SSE
apps/worker    quotes, valuations, agent jobs
packages/core  baskets, series, vs S&P, serializers
packages/ai    research, about fill, critic
packages/db    Prisma schema + migrations
packages/chain Robinhood / 0x / oracles
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

## Day-1 spikes

```bash
pnpm spike
```

Runs 0x quote, Chainlink NVDA feed, and Privy sponsored-swap checks. Missing keys skip the related spike instead of failing the rest.
