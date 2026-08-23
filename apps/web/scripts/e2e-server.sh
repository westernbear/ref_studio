#!/usr/bin/env bash
set -euo pipefail

lock_dir=".next-e2e.lock"
while ! mkdir "$lock_dir" 2>/dev/null; do
  owner="$(cat "$lock_dir/pid" 2>/dev/null || true)"
  if [[ -n "$owner" ]] && ! kill -0 "$owner" 2>/dev/null; then
    rm -rf "$lock_dir"
    continue
  fi
  if [[ -z "$owner" ]] && [[ $(( $(date +%s) - $(stat -c %Y "$lock_dir") )) -gt 5 ]]; then
    rm -rf "$lock_dir"
    continue
  fi
  sleep 0.1
done
printf '%s\n' "$$" > "$lock_dir/pid"
server_pid=""
cleanup() {
  if [[ -n "$server_pid" ]] && kill -0 "$server_pid" 2>/dev/null; then
    kill "$server_pid" 2>/dev/null || true
    wait "$server_pid" 2>/dev/null || true
  fi
  rm -rf "$lock_dir"
}
trap cleanup EXIT
trap 'exit 143' INT TERM

rm -rf .next
next build
next start --hostname 0.0.0.0 --port 3100 &
server_pid="$!"
wait "$server_pid"
