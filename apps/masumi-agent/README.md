# SuperView Masumi agent

Public MIP-003 agent for Sokosumi. Sokosumi calls this service. It opens escrow on the Masumi Payment Service, waits until Preprod funds lock, then calls SuperView research at `https://api.superview.fun`.

There is no Masumi worker. Research is run by the existing SuperView worker behind `api.superview.fun`.

## Railway

Dockerfile: [`deploy/railway/Dockerfile.masumi-agent`](../../deploy/railway/Dockerfile.masumi-agent)

Env paste: [`deploy/railway/masumi.env.example`](../../deploy/railway/masumi.env.example)

```
SUPERVIEW_API_URL=https://api.superview.fun
PAYMENT_SERVICE_URL=https://<ngrok-host>/api/v1
PAYMENT_API_KEY=
SELLER_VKEY=
AGENT_IDENTIFIER=
NETWORK=Preprod
SUPERVIEW_AUTH_TOKEN=Bearer <privy>
```

The payment service stays in the official Masumi repo on a teammate machine. Expose it with ngrok. Point Sokosumi and the Masumi registry at this agent's public Railway URL. Keep the same `AGENT_IDENTIFIER`.

## Flow

1. Sokosumi `POST /start_job` with a 14–26 hex `identifier_from_purchaser` and `input_data.belief`.
2. Agent `POST /api/v1/payment/` and returns `blockchainIdentifier` plus pay deadlines.
3. Sokosumi pays. Agent polls until `FundsLocked`.
4. Agent `POST https://api.superview.fun/v1/research` and waits for a draft brief.
5. Agent `POST /api/v1/payment/submit-result` with the SHA-256 of the brief.
6. Sokosumi `GET /status?job_id=` receives `completed` and the brief string.

Stops at research draft. Does not publish or invest.
