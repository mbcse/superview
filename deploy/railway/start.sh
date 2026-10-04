#!/bin/sh
set -eu

role="${1:-${RAILWAY_SERVICE:-api}}"
export API_PORT="${PORT:-${API_PORT:-4000}}"

case "$role" in
  api|worker|all) ;;
  *)
    echo "unknown service: $role (use api, worker, or all)" >&2
    exit 1
    ;;
esac

if [ "$role" = "api" ] || [ "$role" = "all" ]; then
  echo "railway: applying schema"
  pnpm --filter @takeandstake/db migrate
fi

if [ "$role" = "all" ]; then
  echo "railway: starting worker beside api"
  env -u PORT pnpm --filter @takeandstake/worker start &
  exec pnpm --filter @takeandstake/api start
fi

if [ "$role" = "worker" ]; then
  exec pnpm --filter @takeandstake/worker start
fi

exec pnpm --filter @takeandstake/api start
