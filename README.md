# SuperView

**Say what you believe about the world. Watch it play out.**

SuperView is a social investing product for people who start with a belief about the world, not a ticker. You write one sentence. An agent turns that sentence into a researched basket of [Robinhood Chain](https://robinhood.com) stock tokens. The basket is published as a view, marked live against the S&P 500, and opened to follow, comment, copy, and invest.

The product thesis is simple. People already have views on technology, health, geopolitics, climate, culture, and supply chains. Those views almost never become a sized, benchmarked book. SuperView is the loop that closes that gap: write, research, publish, track, and rebalance as the story changes.

---

## The problem

A belief like “malaria cases will rise” is not a portfolio. Turning it into one requires an economic mechanism, a set of comparable exposures, risk limits, and weights. Most social finance products skip that work and rank opinions by attention. Most portfolio tools skip the belief and start at a symbol search box.

SuperView treats the view as the object. Performance is public. Status comes from how the book does versus the S&P 500, not from follower count.

The gap exists for three reasons:

1. **Translation is hard.** A belief is not a ticker. It needs a mechanism, comparable exposures, risks, and position sizing.
2. **Social conviction is unmeasured.** Most finance feeds reward opinions, not outcomes. SuperView attaches every published view to a live benchmarked basket.
3. **Portfolio construction is still too heavy.** SuperView compresses the research workflow into an agent-led product, then lets users engage through a live market simulation or, when enabled, wallet-based USDG execution.

---

## What a user does

1. Write a short view in their own words from Home or New view.
2. Watch the agent interpret the thesis, screen the Robinhood Chain catalog, research candidates, and size a 5 to 12 name basket.
3. Publish. The view becomes a social object: thesis, holdings, comments, copy, and invest.
4. Track live last prices, today’s move, the value of money they put on the view, and how that book is doing versus the S&P 500.
5. Follow people whose views work. Copy a basket into their own portfolio. Let the agent keep watching and propose trims, adds, exits, or a full rebalance.

| Surface | What you do |
| --- | --- |
| Home / trending | Discover live, benchmarked views from other users |
| New view | Write one sentence and let the agent build the basket |
| View page | Thesis, holdings, live vs S&P chart, comments, copy, invest |
| Portfolio | Track positions, fills, marks, and rebalances |
| Leaderboard | Rank views by market performance, not follower count |

---

## How a view becomes a book

The agent is an investment committee, not a single prompt.

1. **Write.** A short belief in the user’s own words.
2. **Interpret.** The agent extracts the economic mechanism, horizon, assumptions, falsifiers, and 3 to 6 investable angles.
3. **Retrieve.** It screens the Robinhood Chain catalog, supplements with web discovery, and maps companies back to eligible instruments.
4. **Diligence.** Each candidate receives research notes and scores for directness, exposure purity, confidence, quality, and risk.
5. **Construct.** A portfolio manager sizes a 5 to 12 name basket across direct, indirect, shared-interest, and hedge roles.
6. **Review.** A separate critic model can approve the basket or force a revision.
7. **Publish.** The result becomes a social object with a public thesis, holdings, comments, and live vs S&P score.
8. **Monitor.** The agent continues watching the thesis and can propose trims, additions, exits, or rebalances.

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
- Construction: typically 5 to 12 holdings, issuer / sector / role caps, then equal-weight fallback if a single-theme basket would otherwise fail
- Simulated SELL legs are capped to held quantity; pocket mutations serialize under `FOR UPDATE`
- View reads: author always; others only `PUBLISHED` and `PUBLIC` or `UNLISTED`
- Agent memos do not dump prompts or raw JSON into the public thread

---

## After you invest

The view page is not only a vs S&P headline.

- **Your stake** shows current value, dollar P&L, and percent. Right after a fill that is today’s tape applied to the amount you put in. Once the mark leaves the fill, it becomes since you invested.
- **Versus S&P 500** is a separate live number for the basket versus SPY.
- **Each name** shows last, today’s percent, and the dollar P&L on your slice of the basket.
- **Portfolio** shows the same mark at pocket level: value, dollar P&L, percent of cost, vs S&P, and per-name dollars.

Quotes come from Robinhood’s price feed every second, into Redis, then to the app over poll plus server-sent events. Day change is versus the prior cash session close. Weekends use Friday versus Thursday, not a flat zero. Wide after-hours books are clamped to the cash-session range so a stale bid/ask does not invent P&L.

---

## Markets and execution

SuperView uses Robinhood Chain stock tokens as the market instrument. These instruments provide economic exposure to listed companies and are handled with jurisdiction and product controls.

The default demo uses simulated execution against live quotes so anyone can complete the loop safely: view, agent, basket, mark, copy, rebalance. Live USDG execution is wired and gated behind `APP_MODE=live`, the `live_trading` flag, and a Privy wallet signed with a P-256 authorization key.

SuperView is not a broker and does not give investment advice.

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

pnpm and Turborepo.

| Piece | Role |
| --- | --- |
| **Web** | Next.js 15 and React 19. Feed, compose, view, portfolio, marketing. Hosted on Vercel. |
| **API** | Express. Privy auth, research jobs, social graph, execution, `/v1/stream/prices`. |
| **Worker** | Catalog, 1s quotes, marks, research pipeline, daily monitor. |
| **Core** | Basket construction, vs S&P series, ledger, take access. |
| **AI** | Committee prompts, web research, view guard. |
| **Chain** | Robinhood and chainlist RPC pool, 0x, oracles, Privy signing. |
| **DB** | Postgres and Prisma. JSON embeddings with cosine similarity, not pgvector. |

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

Typeface: Saans display, Geist body.

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
NEXT_PUBLIC_POSTHOG_KEY=phc_5918n4s3UPJOIawjTciuy5YrGdotlvB1dTpoZFPTdkM
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
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

## What to show

1. Write a view from Home or New view. Watch interpret, screen, diligence, and construct.
2. Publish. Open the view: live last, today, your stake if you invested, vs S&P, holdings, comments.
3. Invest in simulation. Confirm the portfolio ledger moved against live quotes.
4. Trending and the leaderboard use the same live mark.

The strongest demo is the full simulated loop: view, agent, basket, live mark, copied exposure, and rebalance. Live trading is present and gated. For a room of judges, the complete visible loop is the point.

---

## Disclaimer

SuperView is a software prototype for researching, publishing, and tracking market views. It is not a broker and does not provide investment advice. Robinhood Chain stock tokens provide economic exposure to listed companies and are subject to availability, jurisdiction, and product restrictions. Simulated balances and performance are for demonstration only.
