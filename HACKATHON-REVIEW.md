# SuperView hackathon review

Judge and investor read of the repo as of 1 October 2026. Based on the product code (web, API, worker, research pipeline, chain layer, schema, and tests). No live research run was executed.

## Decision

**Advance this on a Robinhood Chain or AI-agent track. Do not award it first place. Do not invest.**

Overall score: **6.6 / 10**.

Markets, research, and paper fills are real code against live Robinhood data. Rebalance, search, and the leaderboard periods are not. Send this to finals if the demo is the paper loop on a seeded feed. Do not give it first place on the current “agent rebalances” claim.

## Scores


| Lens           | Score | Why                                                                                           |
| -------------- | ----- | --------------------------------------------------------------------------------------------- |
| Idea           | 9     | Belief → constrained basket → vs S&P is a real product, not a wrapper                         |
| Research agent | 8     | Multi-stage pipeline with checkpoints, refusal, critic, and hard portfolio caps               |
| Paper book     | 7     | Ledger, halt checks, oracle deviation, dry-run fills                                          |
| Main app UI    | 7     | Feed, compose, take page, portfolio, and live quotes are the product. Shells are off the rail |
| Tests          | 6     | Optimizer, marks, and series are tested. Golden evals check prompt text, not model output     |
| Live chain     | 5     | Swap path exists. Seed leaves live trading off. Signing looks unfinished                      |
| Cold demo      | 4     | Seed is flags plus a demo user. An empty feed on stage is a loss                              |
| Rebalance      | 3     | The daily agent posts a brief. It does not change the basket or the book                      |




## The product

SuperView is a social desk for beliefs. You write one sentence. An agent turns it into a basket of Robinhood Chain stock tokens, publishes it, and the feed marks that basket against the S&P 500. Paper is the default: live prices, a database USDG ledger. Real money is behind a feature flag and a Privy wallet.

The idea is the strongest thing in the repo. It is specific, demoable, and tied to a real market (Robinhood Chain, chain id 4663, 0x, Chainlink, USDG). The agent can only hold names that exist on that chain.

## What is real


| Piece          | What actually happens                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Universe       | Live fetch of `api.robinhood.com/rhj/assets`. Tokens with fake `0xRH…` addresses are deleted on sync.                                                                                                                                 |
| Prices         | Live fetch of `api.robinhood.com/rhj/prices`. Bid/ask mid, halt, volume. Worker polls about once a second and writes Postgres.                                                                                                        |
| Oracles        | Chainlink feed directory, plus known NVDA and SPY feed addresses.                                                                                                                                                                     |
| Research       | Real OpenAI structured calls: interpret, screen the catalog in batches, diligence via web search, analyst, portfolio manager, critic. If the key is missing, research fails. There is no mock basket.                                 |
| Paper book     | A real double-entry ledger. Starting cash is created in the database (`PAPER_STARTING_USD`, default $10,000). Fills use the live Robinhood ask, or a 0x quote when `ZEROX_API_KEY` is set and the quote is within 1.5% of the oracle. |
| Receipts       | Publish hashes the basket. `/r/:hash` checks that hash.                                                                                                                                                                               |
| Portfolio math | Caps for cash, issuer, sector, and role are real functions with tests.                                                                                                                                                                |


Paper money is simulated. The marks on that money are live.

The research path screens the Robinhood catalog, optionally searches the web for names that map back onto that catalog, runs diligence, scores names, sizes a portfolio, and sends it through a critic. If the critic says revise, the portfolio manager runs again. `constructPortfolio` enforces cash, issuer, sector, and role caps. Thin universes return `INSUFFICIENT_ELIGIBLE_EXPOSURE` instead of a fake basket. Runs checkpoint so a retry does not redo finished stages.

Publishing writes a portfolio target and a SHA-256 receipt. The take page streams marks and draws the basket against the S&P. The main navigation matches that story: Trending, Compose, Portfolio, Profile.

## What is not real

- **Rebalance does not trade.** The daily agent calls a model, writes a brief, and posts a comment. Autopilot sets the proposal to `AUTO_EXECUTED`. It does not create a new target, a new revision, or ledger fills. Approving a paper proposal marks the order `FILLED` with no legs.
- **Pocket chat overclaims.** “Add $500” on autopilot does deposit paper cash and can invest it. “Trim NVDA” or “add a name” only stores a pending proposal, including when the mandate is autopilot. The reply still says the agent will rebalance as the story changes.
- **Company text starts empty.** Catalog sync stores the legal name and an empty `businessSummary`. Screening quality depends on a later enrichment job. A fresh database researches names the model barely knows.
- **Corporate actions are unused.** The Robinhood corporate-actions URL is declared and never fetched.
- **Leaderboard periods are a costume.** The UI sends `1D`, `1W`, `1M`, or `All`. The API reads `period` and discards it. Every tab is the same sort.
- **Search is wired to the wrong page.** The header writes `q` and navigates to Trending. Trending never reads `q`. The filter only runs on the home feed.
- **Seed is empty.** It creates flags and a `demo` user. No tokens, no views, no price history.
- **Parallel client is leftover.** The live pipeline uses OpenAI web search, not the Parallel find-all client. That client refuses to run without a key and does not invent companies.
- **Golden evals do not call the model.** They check that sample sentences are long enough to fill a prompt.
- **README overstates pgvector.** Embeddings are JSON. Similarity is a cosine in application code.
- **Shells exist off the rail.** The order page is static labels. Circles and collections are thin forms.

There is no random price path and no fixture basket shipped as if it were the market.

## Bugs that matter

- **Search lands on a page that ignores the query.** A judge types “NVDA” in the header and sees the unfiltered board.
- **Period tabs do not change the ranking.** Clicking 1D versus All is a no-op on the server.
- **Autopilot and Approve do not move the book.** This is the submission’s main functional hole.
- **Research screens a blank catalog** until enrichment has run.
- `GET /v1/feed` **writes the database.** Every feed load hides comments whose body contains `invalid token`.

`POST /v1/catalog/sync` **has no auth.** Research-run reads do not check the owner. Outside production, a bad Privy token falls through to the demo user.

- **Live signing is not demo-safe.** The Privy call puts `PRIVY_AUTHORIZATION_KEY` in the signature header as a raw string. Seed correctly leaves `live_trading` off. Leave it off on stage.
- **Paper invest is not one transaction.** A crash mid-loop leaves a partial book.

Code quality on the core is better than typical hackathon code: monorepo boundaries, Zod on the important writes, research checkpoints, portfolio constraints with tests, and a narrow main nav. Quality falls off in the large API route file, which has several unowned writes, and in surfaces that look finished and are not.

## Win chances


| Room                                                | Chance                                                                                                    | Why                                                                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Open hackathon, first place                         | Low, about 10–20%                                                                                         | The idea is strong. The headline feature does not complete, and a cold start shows an empty feed.                   |
| Robinhood, onchain equities, or agent track, finals | Real, about 35–50% if the demo is seeded                                                                  | Live catalog, live quotes, constrained baskets, paper ledger, and receipts are what that jury wants.                |
| First place on that track                           | Possible only with a seeded 90-second demo of sentence → basket → paper fill → a live tick versus the S&P | Do not click rebalance, search, or period tabs.                                                                     |
| Investor check this week                            | No                                                                                                        | Take a meeting after autopilot changes a paper book and a week of marks exists on views that are already published. |




## Improvement scope, in order

1. **Seed six published views** with baskets and several days of valuations before you submit or present.
2. **Make autopilot write a new target and paper fills**, or delete “rebalance” from the README, homepage, and pocket-chat reply.
3. **Point search at the home feed**, or filter Trending by `q`.
4. **Either compute 1D / 1W / All from valuation history or remove the tabs.**
5. **Run enrichment once after catalog sync** so screening sees descriptions, sectors, and embeddings.
6. **Precompute the stage thesis** so judging does not wait on a full model screen.
7. **Auth-gate catalog sync** and turn demo-user fallback off on any public deploy.
8. Leave live USDG off. Corporate actions, circles, and the order page can wait until after the deadline.



## Pitch that matches the code

Write a belief. SuperView researches Robinhood Chain stock tokens, sizes a basket, and shows whether it beats the S&P on paper. Live money stays behind a flag.

## Bottom line

Submit it. The research loop and the live Robinhood marks are good enough to compete. Win condition is a seeded paper demo of one belief. Lose condition is opening on an empty feed, or inviting a judge to watch the agent rebalance.