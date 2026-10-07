# @takeandstake/masumi-worker

Glue between Sokosumi Tasks and `masumi-agent`.

- **Observes** payment/escrow on Masumi Payment Service (does not store payment in SuperView DB).
- **After** escrow is funded (or `MOCK_PAYMENTS=true`), calls the agent.
- **Personal smoke:** keep `MOCK_PAYMENTS=true`, then `pnpm smoke:masumi-personal` from the repo root (no org coworker required).
- See [../masumi-agent/README.md](../masumi-agent/README.md) for Personal Preprod vs org flow.
