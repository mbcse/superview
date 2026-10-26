# Metropolis (Monad) + World's Fair notes

Work added for [Metropolis](https://monad.xyz/developers/hackathons/metropolis) and Colosseum World's Fair.

## What is new

- Agent picks companies. Code picks one venue per company across Solana, Robinhood Chain, Base, and Monad.
- Monad desk: native xStocks, AUSD cash. Paper fills against issuer marks. Live only when a real 0x or Kuru Flow quote returns size.
- Mera passkey login via `@category-labs/mera`. One passkey derives a BIP-44 EVM key and a BIP-44 Solana key. Keys stay in the browser. Returning users use `getPasskeyPrfOutput`.
- Live Mera trades: the API builds the unsigned transaction, the browser signs it, the API broadcasts and confirms. Autopilot is off for Mera wallets.
- Paper money is one USD balance per pocket. Live cash is the on-chain balance on that chain.

## Track

Onchain Finance & Trading.

## Proof judges should look at

- Passkey login on the deployed app
- A view where the agent routes a name to Monad
- Paper fill against a Monad xStock mark
- AUSD as Monad cash
- A confirmed live order. Explorer links are written from the fill, not invented here. After a live xStock buy the Solana signature is on Solscan. After a Monad fill the hash is on Monadvision.

Built in the Metropolis window: Monad catalog, AUSD cash, official Mera login, venue router, paper USD, Base catalog, client-signed live legs.
