#!/usr/bin/env bash
# P7.3 `$browse` no-sandbox manual-QA runner.
#
# Builds the API (dist) + production web bundle, starts the committed motion
# fixture API server and a production Next server, then drives Playwright
# Chromium with --no-sandbox across the EN/KO viewport matrix and writes
# evidence under .omo/evidence/motion-complete-browse-<timestamp>/.
set -euo pipefail

cd "$(dirname "$0")/../.."
ROOT="$(pwd)"

FIXTURE_PORT="${FIXTURE_PORT:-3199}"
NEXT_PORT="${NEXT_PORT:-3101}"
SITE="http://127.0.0.1:${NEXT_PORT}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="${OUT:-${ROOT}/.omo/evidence/motion-complete-browse-${STAMP}}"
export GSTACK_CHROMIUM_NO_SANDBOX=1
# The default ms-playwright cache holds the installed browsers; a sandboxed
# PLAYWRIGHT_BROWSERS_PATH may point at a nonexistent dir, so prefer the real one.
if [ -d "$HOME/.cache/ms-playwright" ]; then
  export PLAYWRIGHT_BROWSERS_PATH="$HOME/.cache/ms-playwright"
fi

echo "== build api + web =="
pnpm --filter @rvs/api build >/dev/null
pnpm --filter @rvs/web build >/dev/null

FIXTURE_PID=""
NEXT_PID=""
cleanup() {
  [ -n "$NEXT_PID" ] && kill "$NEXT_PID" 2>/dev/null || true
  [ -n "$FIXTURE_PID" ] && kill "$FIXTURE_PID" 2>/dev/null || true
}
trap cleanup EXIT

echo "== start fixture API on ${FIXTURE_PORT} =="
FIXTURE_LOG="$(mktemp)"
RVS_BROWSER_ORIGIN="${SITE}" node apps/web/test/motion-workspace-browser-server.mjs >"$FIXTURE_LOG" 2>&1 &
FIXTURE_PID=$!

JOB_ID=""
for _ in $(seq 1 60); do
  if grep -q "motion-browser-fixture" "$FIXTURE_LOG" 2>/dev/null; then
    JOB_ID="$(awk '/motion-browser-fixture/{print $3; exit}' "$FIXTURE_LOG")"
    break
  fi
  sleep 0.5
done
if [ -z "$JOB_ID" ]; then
  echo "fixture server failed to start:" >&2
  cat "$FIXTURE_LOG" >&2
  exit 1
fi
echo "fixture job: ${JOB_ID}"

echo "== start production Next on ${NEXT_PORT} =="
RVS_INTERNAL_API_URL="http://127.0.0.1:${FIXTURE_PORT}" \
  RVS_EXPECTED_ORIGIN="${SITE}" \
  RVS_INSECURE_COOKIES=true \
  pnpm --filter @rvs/web exec next start --port "${NEXT_PORT}" >/tmp/next-browse.log 2>&1 &
NEXT_PID=$!

for _ in $(seq 1 120); do
  if curl -sf "${SITE}/en-US/scene-review?jobId=${JOB_ID}" >/dev/null 2>&1; then
    break
  fi
  sleep 0.5
done

echo "== drive Playwright =="
SITE="${SITE}" JOB_ID="${JOB_ID}" OUT="${OUT}" REPO="${ROOT}" \
  node "${ROOT}/scripts/qa/browse-motion-workspace.mjs"

echo "evidence: ${OUT}"
