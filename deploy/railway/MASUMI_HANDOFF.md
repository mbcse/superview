# Masumi Cardano Preprod — deploy handoff (Mainnet skipped)

For the teammate deploying to Railway. You already registered **SuperView Research** on local MPS Preprod; production URL must be the **Railway agent HTTPS** (re-register if still pointing at ngrok).

## Manual vs prepared

| Who | What |
| --- | --- |
| **Prepared in repo** | Dockerfiles, env templates, MIP-003 gate curls, admin message template |
| **You (manual, short)** | Fill secrets vault; Sokosumi Vendor CLI; send admin pack; after deploy verify MIP-003 + paid tx hash |
| **Teammate (deploy)** | Railway services, SuperView + MPS + agent + worker, wire env, fund wallet, MPS register URL update |

## Railway services

| Service | Dockerfile | Public? |
| --- | --- | --- |
| superview | `deploy/railway/Dockerfile` | yes (API) |
| masumi-agent | `deploy/railway/Dockerfile.masumi-agent` | **yes** |
| masumi-worker | `deploy/railway/Dockerfile.masumi-worker` | private OK |
| mps | masumi-payment-service repo `Dockerfile` | yes (admin + `/api/v1`) |

Separate Postgres for SuperView vs MPS. Env paste sheet: [masumi.env.example](./masumi.env.example).

## MIP-003 gate (registration URL must pass)

```bash
BASE=https://masumi-agent-XXXX.up.railway.app
curl -sS "$BASE/health"
curl -sS "$BASE/availability"
curl -sS "$BASE/input_schema"
curl -sS -X POST "$BASE/start_job" -H 'content-type: application/json' \
  -d '{"identifier_from_purchaser":"judge-1","input_data":{"belief":"AI infrastructure demand will outgrow cloud spend"}}'
# then: curl -sS "$BASE/status?job_id=<id>" until status=completed and result is a string
```

## Admin pack (Sokosumi org approve)

```
Please provision / approve coworker for TOKEN2049 Origins Hackathon 2026 (Sokosumi Preprod).

Vendor ID: <from: npx sokosumi@latest --preprod vendors create ...>
Coworker name: SuperView Research
Capabilities: tasks
MIP-003 base URL: https://masumi-agent-XXXX.up.railway.app
Masumi agentIdentifier (Preprod): <from MPS after Railway URL register>
Network: Preprod / tUSDM / 1 unit
Verified live: GET /availability + GET /input_schema OK

Please return: Coworker ID, Organization/Workspace ID, Workspace slug,
Access request ID (if used).
```

After IDs: `coworkers connect` + set `--base-url` to Railway agent. Check **org workspace** (not Personal); may be visible only to you until admin approves.

## Judges payment proof

1. `MOCK_PAYMENTS=false` on worker.
2. Paid Preprod hire from Sokosumi.
3. MPS admin → payment → **Cardano Preprod tx hash**.
4. Mock `pnpm smoke:masumi-personal` is not judge proof.

## Your CLI (Vendor) before/after teammate has agent URL

```bash
unset SOKOSUMI_API_KEY SOKOSUMI_AUTH_TOKEN
npx sokosumi@latest --preprod auth login
npx sokosumi@latest --preprod vendors create --name "SuperView" --slug "superview-jatin" --json
```

Send Vendor ID + Railway base URL in the admin pack once agent is live.
