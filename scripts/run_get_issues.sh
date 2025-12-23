#!/usr/bin/env bash
set -euo pipefail

# ── CONFIG ──────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="${REPO_DIR:-"${SCRIPT_DIR}/.."}"
PY="${PY:-python3}"
CMD_ARGS="${CMD_ARGS:-RVS --add-summary --sub-tasks --list-subtasks --structured-output --linked-issues}"
INTERVAL_SEC="${INTERVAL_SEC:-$((30*60))}"
RUN_ONCE="${RUN_ONCE:-}"
# ───────────────────────────────────────────────────────────────────

cd "$REPO_DIR"

if [[ ! -f "get-issues.py" ]]; then
    echo "[RVS] ERROR: get-issues.py not found in ${REPO_DIR}"
    exit 1
fi

read -r -a CMD_ARRAY <<< "$CMD_ARGS"

run_once(){
    local ts
    ts="$(date '+%Y-%m-%d %H:%M:%S')"
    echo "[RVS] $ts — running…"
    "$PY" ./get-issues.py "${CMD_ARRAY[@]}"
}

if [[ -n "$RUN_ONCE" ]]; then
    run_once
    exit 0
fi

echo "[RVS] Timer started — interval: ${INTERVAL_SEC}s"
while true; do
    if ! run_once; then
        echo "[RVS] ERROR (soft-fail — continuing)"
    fi
    echo "[RVS] Sleeping ${INTERVAL_SEC}s…"
    sleep "$INTERVAL_SEC"
done
