#!/usr/bin/env bash
# Personal Preprod local smoke — unpaid (MOCK_PAYMENTS=true). No org coworker required.
set -euo pipefail

AGENT_URL="${MASUMI_AGENT_URL:-http://127.0.0.1:8080}"
WORKER_URL="${MASUMI_WORKER_URL:-http://127.0.0.1:8090}"
API_URL="${SUPERVIEW_API_URL:-http://127.0.0.1:4000}"
BELIEF="${1:-AI infrastructure demand will outgrow cloud spend}"
TASK_ID="${2:-personal-$(date +%s)}"

echo "== health =="
curl -sf "$API_URL/health" >/dev/null && echo "api ok" || { echo "api down: $API_URL"; exit 1; }
curl -sf "$AGENT_URL/health" >/dev/null && echo "agent ok" || { echo "agent down: $AGENT_URL"; exit 1; }
curl -sf "$WORKER_URL/health" >/dev/null && echo "worker ok" || { echo "worker down: $WORKER_URL"; exit 1; }

BODY=$(TASK_ID="$TASK_ID" BELIEF="$BELIEF" python3 - <<'PY'
import json, os
print(json.dumps({"taskId": os.environ["TASK_ID"], "belief": os.environ["BELIEF"]}))
PY
)

echo "== POST $WORKER_URL/v1/tasks/run taskId=$TASK_ID =="
curl -sS -X POST "$WORKER_URL/v1/tasks/run" \
  -H 'content-type: application/json' \
  -d "$BODY"
echo
