# SuperView

**Say what you believe about the world. Watch it play out.**

SuperView turns a one-sentence market view into a researched basket of [Robinhood Chain](https://robinhood.com) stock tokens, tracks it against the S&P 500, and makes the result social. Users can publish views, follow the people whose ideas perform, copy a basket, and build a portfolio around live market signals.

The product is designed around a simple belief: investing should start with what you think about the world, not with a ticker search box.

---

## The problem

People constantly form views about technology, geopolitics, climate, health, culture, and supply chains. Those views rarely become structured portfolios.

The gap exists for three reasons:

1. **Translation is hard.** A belief like “malaria cases will rise” is not a ticker. It needs an economic mechanism, comparable exposures, risks, and position sizing.
2. **Social conviction is unmeasured.** Most finance feeds reward opinions, not outcomes. SuperView attaches every published view to a live benchmarked basket.
3. **Portfolio construction is still too heavy.** SuperView compresses the research workflow into an agent-led product experience, then lets users engage through a live market simulation or, when enabled, wallet-based USDG execution.

SuperView creates the loop: write a view, let the agent research it, publish the basket, track performance, and rebalance as the story changes.

---

## What we are building

SuperView is a **social investing network for market views**.

| Surface | What you do |
| --- | --- |
| Home / trending | Discover live, benchmarked views from other users |
| New view | Write one sentence and let the agent build the basket |
| View page | Thesis, holdings, live vs S&P chart, comments, copy, invest |
| Portfolio | Track positions, fills, marks, and rebalances |
| Leaderboard | Rank views by market performance, not follower count |

SuperView uses Robinhood Chain stock tokens as the market instrument. These instruments provide economic exposure to listed companies and are handled with jurisdiction and product controls. The default demo flow uses simulated execution against live quotes, while live USDG execution is separately gated.

---

## How a view becomes a book

1. **Write.** A short belief in the user’s own words.
2. **Interpret.** The agent extracts the economic mechanism, horizon, assumptions, falsifiers, and 3-6 investable angles.
3. **Retrieve.** It screens the Robinhood Chain catalog, supplements with web discovery, and maps companies back to eligible instruments.
4. **Diligence.** Each candidate receives research notes and scores for directness, exposure purity, confidence, quality, and risk.
5. **Construct.** A portfolio manager sizes a 5-12 name basket across direct, indirect, shared-interest, and hedge roles.
6. **Review.** A separate critic model can approve the basket or force a revision.
7. **Publish.** The result becomes a social object with a public thesis, holdings, comments, and live vs S&P score.
8. **Monitor.** The agent continues watching the thesis and can propose trims, additions, exits, or rebalances.

The demo flow emphasizes simulated execution against live quotes. Live USDG execution is wired behind `APP_MODE=live`, the `live_trading` flag, and a Privy wallet signed with a P-256 authorization key.

---

## The agent

The agent is structured as an **investment committee**, not a single prompt.

```
view
  -> interpreter       mechanism, horizon, assumptions, falsifiers
  -> screen/discover   catalog names, web names, universe match
  -> diligence         company notes and supporting evidence
  -> analyst           directness, purity, confidence, risk
  -> portfolio         weights, cash, roles, basket thesis
  -> critic            approve or revise
  -> construct         hard constraints and investable book
  -> monitor           no_change, rebalance, add, trim, exit
```

**Models (defaults):** `gpt-4o` research, `gpt-4o-mini` fast path, `claude-haiku-4-5` critic and social. Interpreter evals run when `OPENAI_API_KEY` is set.

**Guardrails the model does not get to skip**

- Only names that exist as active Robinhood Chain tokens
- Halted names excluded
- Construction: typically 5-12 holdings, issuer / sector / role caps, then equal-weight fallback if a single-theme basket would otherwise die
- Simulated SELL legs are capped to held quantity; pocket mutations serialize under `FOR UPDATE`
- View reads: author always; others only `PUBLISHED` and `PUBLIC` or `UNLISTED`
- Agent memos do not dump prompts or raw JSON into the public thread

---

## Architecture

```
┌────────────┐     REST + SSE      ┌────────────┐     BullMQ      ┌────────────┐
│  Next.js   │ ──────────────────► │  Express   │ ──────────────► │   Worker   │
│  :3000     │   quotes / stream   │  :4000     │                 │  research  │
│  Vercel    │ ◄──── EventSource ─ │  Railway   │ ◄── Redis ───── │  quotes 1s │
└────────────┘                     └─────┬──────┘                 │  mark/book │
                                         │                        └─────┬──────┘
                                         ▼                              ▼
                                   Postgres + Prisma              RH REST / RPCs
                                   (JSON embeddings,              Chainlink, 0x
                                    cosine, not pgvector)
```

| Piece | Role |
| --- | --- |
| **Web** | Next.js 15 / React 19. Feed, compose, take, pockets, marketing |
| **API** | Express. Auth (Privy), research jobs, social graph, execution routes, `/v1/stream/prices` |
| **Worker** | Catalog, 1s Robinhood quotes → Redis `quotes:last`, marks, research pipeline, monitor |
| **Core** | Basket construction, vs S&P series, simulated ledger, take access |
| **AI** | Prompts, committee, web research, view guard |
| **Chain** | Robinhood + chainlist RPC pool, 0x, oracles, Privy signing |

Quotes: RHJ REST every 1s → Redis → poll + SSE. Day change is vs prior cash session close (weekends use Friday vs Thursday, not a flat 0%).

---

## Repo

```
apps/web          SuperView UI
apps/api          REST + SSE
apps/worker       quotes, research, agent, catalog
packages/core     books, series, fills, access
packages/ai       committee + monitor
packages/db       Prisma + seed
packages/chain    RH / 0x / oracles / Privy
packages/config   env
deploy/railway    Hobby Docker (API + worker)
```

pnpm + Turborepo. Typeface: Saans display, Geist body.

---

## Run it locally

```bash
pnpm install
cp .env.example .env
docker compose up -d          # Postgres + Redis
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm dev
```

- Web: [http://localhost:3000](http://localhost:3000)
- API: [http://localhost:4000](http://localhost:4000) · `GET /health`

`OPENAI_API_KEY` is required for a real research run. Privy, Anthropic, and 0x are optional until login, critic review, or live execution. Demo-user fallback is **on in development only**; production stays off unless `ALLOW_DEMO_USER=true`.

```bash
pnpm spike    # 0x quote, Chainlink NVDA, Privy swap. Missing keys skip.
pnpm test
```

---

## Production shape

| Host | Service |
| --- | --- |
| **Vercel** | `apps/web` |
| **Railway (Hobby)** | Postgres + Redis + one Docker box (`deploy/railway/hobby.toml`) running API + worker |

Use **Docker**, not Railpack (repo root looks like Next.js). Leave Railway **Root Directory** empty. Dockerfile: `deploy/railway/Dockerfile`.

**Vercel**

```
NEXT_PUBLIC_API_ORIGIN=https://api.yourdomain.com
NEXT_PUBLIC_PRIVY_APP_ID=
```

**Railway**

```
NODE_ENV=production
APP_MODE=paper
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
WEB_ORIGIN=https://your-app.vercel.app
API_ORIGIN=https://api.yourdomain.com
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
PRIVY_APP_ID=
PRIVY_APP_SECRET=
ADMIN_TOKEN=
```

`API_ORIGIN` must be a real `https://...` URL (not `https://` with an empty host). Railway `PORT` is injected. Do not publish `:4000` on a custom domain. Seed once against the Railway database: `DATABASE_URL=... pnpm db:seed`.

Hobby is usage-billed and this worker ticks quotes every second, so expect to spend past the included credit.

---

## What to show judges

1. Write a view from Home or New view. Watch interpret → screen → diligence → basket.
2. Publish. Open the view: vs S&P, holdings with live last / day change, comments.
3. Invest in simulation. Confirm the portfolio ledger moved against live quotes.
4. Trending + leaderboard use the same live mark.

The strongest demo is the full simulated investing loop: view, agent, basket, live mark, copied exposure, and rebalance. Live trading is wired and gated, but the submission experience is strongest when the audience can safely see the complete loop.

---

## Disclaimer

SuperView is a software prototype for researching, publishing, and tracking market views. It is not a broker and does not provide investment advice. Robinhood Chain stock tokens provide economic exposure to listed companies and are subject to availability, jurisdiction, and product restrictions. Simulated balances and performance are for demonstration only.
