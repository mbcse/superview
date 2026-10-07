# Masumi / Sokosumi apps (Cardano track — Preprod)

Two **new** apps beside SuperView. They do **not** change `apps/web`, `apps/api`, `apps/worker`, or Prisma.

| App | Role |
| --- | --- |
| [`masumi-agent`](./masumi-agent) | MIP-003 HTTP API → existing `POST /v1/research` until DRAFT |
| [`masumi-worker`](./masumi-worker) | Waits for **Masumi escrow**, then calls the agent |

MPS is run separately (local or Railway). **Mainnet is out of scope** for this handoff.

Payment status: **Masumi/MPS only**. SuperView DB only stores the research run.

## Deploy handoff (Railway)

Full checklist for your teammate: [`deploy/railway/MASUMI_HANDOFF.md`](../../deploy/railway/MASUMI_HANDOFF.md)

| Artifact | Path |
| --- | --- |
| Agent Dockerfile | [`deploy/railway/Dockerfile.masumi-agent`](../../deploy/railway/Dockerfile.masumi-agent) |
| Worker Dockerfile | [`deploy/railway/Dockerfile.masumi-worker`](../../deploy/railway/Dockerfile.masumi-worker) |
| Env paste template | [`deploy/railway/masumi.env.example`](../../deploy/railway/masumi.env.example) |

Prod start (no `.env` files; Railway injects vars): `pnpm start:prod` inside each app (used by Docker `tsx src/index.ts`).

## Personal / local smoke

```bash
pnpm dev:masumi-agent
pnpm dev:masumi-worker
# worker MOCK_PAYMENTS=true
pnpm smoke:masumi-personal
```

## MIP-003 (must work at registration URL)

- `GET /availability` → `status: "available"`
- `GET /input_schema` → `belief` (+ optional `horizon`)
- `POST /start_job` → `{ job_id, status }` with `identifier_from_purchaser` + `input_data.belief`
- `GET /status?job_id=` → `completed` + string `result` + `resultHash`

## Sokosumi org (you) + admin

1. `npx sokosumi@latest --preprod vendors create --name "SuperView" --slug "superview-jatin" --json`
2. Send admin pack from [MASUMI_HANDOFF.md](../../deploy/railway/MASUMI_HANDOFF.md) (Vendor ID + Railway agent URL + agentIdentifier).
3. After Coworker ID: `coworkers connect` / `update --base-url`. View in **org workspace**; may be private until approve.
4. Paid hire: `MOCK_PAYMENTS=false`; capture **tx hash** in MPS for judges.

## Safety

- Stops at research **DRAFT** — never auto-publishes or paper-invests.
- Does not edit compose / RH paper invest pipeline.
