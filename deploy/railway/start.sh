#!/bin/sh
set -eu

role="${1:-${RAILWAY_SERVICE:-api}}"
export API_PORT="${PORT:-${API_PORT:-4000}}"

# Railway templates like https://${{RAILWAY_PUBLIC_DOMAIN}} become "https://" before a domain exists.
case "${API_ORIGIN:-}" in
  ""|"https://"|"http://")
    if [ -n "${RAILWAY_PUBLIC_DOMAIN:-}" ]; then
      export API_ORIGIN="https://${RAILWAY_PUBLIC_DOMAIN}"
    elif [ -n "${RAILWAY_STATIC_URL:-}" ]; then
      export API_ORIGIN="${RAILWAY_STATIC_URL}"
    else
      export API_ORIGIN="http://localhost:${API_PORT}"
    fi
    echo "railway: API_ORIGIN=${API_ORIGIN}"
    ;;
esac

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
