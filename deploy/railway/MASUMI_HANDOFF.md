# Masumi Cardano Preprod — deploy handoff

Payment Service is **not** in this repo. A teammate runs `masumi-payment-service` and exposes it with ngrok. This repo only deploys **masumi-agent** to Railway. Sokosumi calls that agent. SuperView research already runs on `https://api.superview.fun`.

## Railway

| Service | Dockerfile | Public? |
| --- | --- | --- |
| masumi-agent | `deploy/railway/Dockerfile.masumi-agent` | yes |
| SuperView API | existing `deploy/railway/Dockerfile` | `https://api.superview.fun` |

Do not deploy `masumi-worker`. Env paste: [masumi.env.example](./masumi.env.example).

## After the agent is live

1. Set the registry API URL on the payment service to `https://YOUR-MASUMI-AGENT.up.railway.app`. Keep the same `AGENT_IDENTIFIER`.
2. Set the Sokosumi coworker base URL to that same agent URL.
3. Check:

```bash
BASE=https://masumi-agent-XXXX.up.railway.app
curl -sS "$BASE/health"
curl -sS "$BASE/availability"
curl -sS "$BASE/input_schema"
```

A paid Sokosumi hire should return `blockchainIdentifier` from `POST /start_job`. Status stays `awaiting_payment` until the Preprod tx locks, then the brief completes. The Cardano tx hash is on the payment-service purchase, not in SuperView.
