#!/usr/bin/env bash
set -euo pipefail

lock_file=".next-e2e.lock"
if [[ -d "$lock_file" ]]; then rm -rf "$lock_file"; fi
exec 9>"$lock_file"
flock --wait 120 9
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
}
trap cleanup EXIT
trap 'exit 143' INT TERM

rm -rf .next
next build
next start --hostname 0.0.0.0 --port 3100 &
server_pid="$!"
wait "$server_pid"
