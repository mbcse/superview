FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml turbo.json tsconfig.base.json ./
COPY deploy/railway/pnpm-workspace.yaml pnpm-workspace.yaml
COPY apps/api/package.json apps/api/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/ai/package.json packages/ai/package.json
COPY packages/chain/package.json packages/chain/package.json
COPY packages/config/package.json packages/config/package.json
COPY packages/core/package.json packages/core/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json

# ws/bullmq optional natives are not required; skip so slim images need no Python/g++.
RUN pnpm install --frozen-lockfile --no-optional

COPY . .

RUN pnpm --filter @takeandstake/db generate \
  && chmod +x deploy/railway/start.sh

ENV NODE_ENV=production
ENV HOST=0.0.0.0

EXPOSE 4000

ENTRYPOINT ["sh", "/app/deploy/railway/start.sh"]
CMD ["all"]
