# takeAndStake

A take becomes a researched Stock Token portfolio. Watch it, dry-run it, or invest from a Privy wallet on Robinhood Chain.

Copy uses **Stock Tokens**, never “tokenized stocks.” This is not investment advice. Stock Tokens are economic exposure, not share ownership. They are not available to US persons or residents of the UK, Canada, Switzerland, the UAE, sanctioned countries, or other restricted jurisdictions.

## Stack

pnpm + Turborepo · Next.js · Express · Prisma/Postgres · BullMQ/Redis · Privy · 0x · Chainlink · Parallel + Claude

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

## Day-1 spikes

```bash
pnpm spike
```

Runs 0x quote, Chainlink NVDA feed, Parallel FindAll, and Privy sponsored-swap checks. Missing keys skip the related spike instead of failing the rest.
