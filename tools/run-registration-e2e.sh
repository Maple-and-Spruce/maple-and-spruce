#!/usr/bin/env bash
#
# Run the registration FE→BE E2E suite against local Firebase emulators.
#
# Lighter than tools/run-integration-tests.sh because Phase-1 E2E doesn't
# need the Square/Webflow/Etsy mock servers — the tests stop short of
# Square tokenization. Only the auth/firestore/functions emulators are
# booted; Playwright drives the Vite harness against them.
#
# Usage:
#   ./tools/run-registration-e2e.sh             # headless run
#   ./tools/run-registration-e2e.sh --ui        # Playwright UI mode
#   ./tools/run-registration-e2e.sh --debug     # Playwright debug mode
#
# Port isolation: respects EMULATOR_PORT_OFFSET (source .env.worktree)
# so parallel worktrees never collide.
#
# Prerequisites: Java 21+, pnpm, the four function codebases built (the
# script invokes `nx run-many` to make sure dist is fresh).
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

OFFSET="${EMULATOR_PORT_OFFSET:-0}"
FUNCTIONS_PORT=$((5001 + OFFSET))
FIRESTORE_PORT=$((8080 + OFFSET))
AUTH_PORT=$((9099 + OFFSET))
UI_PORT=$((4000 + OFFSET))
HARNESS_PORT=$((4173 + OFFSET))

PLAYWRIGHT_EXTRA_ARGS=()
case "${1:-}" in
  --ui)    PLAYWRIGHT_EXTRA_ARGS+=("--ui") ;;
  --debug) PLAYWRIGHT_EXTRA_ARGS+=("--debug") ;;
esac

# Kill stale processes on OUR ports (leave other worktrees alone).
for port in "$FUNCTIONS_PORT" "$FIRESTORE_PORT" "$AUTH_PORT" "$UI_PORT" "$HARNESS_PORT"; do
  lsof -ti:"$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
done
sleep 1

echo "Building function codebases…"
pnpm exec nx reset 2>/dev/null || true
pnpm exec nx run-many \
  --target=build \
  --projects=functions,functions-calendar,functions-square,functions-sync \
  --parallel=4

# Firebase emulator requires ALL project-level params in every codebase's
# .env, even ones that codebase doesn't use — otherwise it silently hangs
# on a stdin prompt. Strip comments/blanks (the parser doesn't tolerate
# them) and append per-codebase fakes for secrets so functions boot.
echo "Setting up emulator environment…"
for dir in dist/apps/functions dist/apps/functions-square dist/apps/functions-sync dist/apps/functions-calendar; do
  grep -v '^#' .env.dev | grep -v '^$' > "$dir/.env"
done
echo "ETSY_API_BASE=http://localhost:99999/v3/application" >> dist/apps/functions/.env
printf "ETSY_API_KEY=fake\nETSY_SHARED_SECRET=fake\n" > dist/apps/functions/.secret.local
printf "SQUARE_ACCESS_TOKEN=mock-token\nSQUARE_WEBHOOK_SIGNATURE_KEY=mock-key\nETSY_API_KEY=fake\nETSY_SHARED_SECRET=fake\n" > dist/apps/functions-square/.secret.local
printf "WEBFLOW_API_TOKEN=mock-token\nETSY_API_KEY=fake\nETSY_SHARED_SECRET=fake\n" > dist/apps/functions-sync/.secret.local

# Add the harness origin to the CORS allowlist for every codebase. The
# .env in dist already carries the standard ALLOWED_ORIGINS from .env.dev;
# Firebase's dotenv parser takes the last value on duplicate keys, so an
# extended line at the end wins. Without this, every callable from the
# harness comes back as `permission-denied` (the CORS middleware returns
# 403 → SDK maps to permission-denied).
HARNESS_ORIGINS="http://127.0.0.1:$HARNESS_PORT,http://localhost:$HARNESS_PORT"
for dir in dist/apps/functions dist/apps/functions-square dist/apps/functions-sync dist/apps/functions-calendar; do
  EXISTING=$(grep '^ALLOWED_ORIGINS=' "$dir/.env" | head -1 | cut -d= -f2-)
  echo "ALLOWED_ORIGINS=$EXISTING,$HARNESS_ORIGINS" >> "$dir/.env"
done

# Pick a firebase.json with shifted ports for non-zero offset.
FIREBASE_CONFIG_FILE="firebase.json"
if [ "$OFFSET" != "0" ]; then
  FIREBASE_CONFIG_FILE="firebase.e2e.worktree.json"
  node -e "
    const fs = require('fs');
    const cfg = JSON.parse(fs.readFileSync('firebase.json', 'utf8'));
    cfg.emulators.functions.port = $FUNCTIONS_PORT;
    cfg.emulators.firestore.port = $FIRESTORE_PORT;
    cfg.emulators.auth.port = $AUTH_PORT;
    cfg.emulators.ui.port = $UI_PORT;
    fs.writeFileSync('$FIREBASE_CONFIG_FILE', JSON.stringify(cfg, null, 2));
  "
fi

# Run Playwright inside the emulator scope. emulators:exec boots the
# emulators, runs the command, and tears them down on exit — no manual
# cleanup needed.
PLAYWRIGHT_CMD=(pnpm exec nx run registration-e2e:e2e)
if [ ${#PLAYWRIGHT_EXTRA_ARGS[@]} -gt 0 ]; then
  PLAYWRIGHT_CMD+=("--" "${PLAYWRIGHT_EXTRA_ARGS[@]}")
fi

EXIT_CODE=0
EMULATOR_PORT_OFFSET="$OFFSET" \
  npx firebase --config "$FIREBASE_CONFIG_FILE" emulators:exec \
    --project=dev \
    --only auth,firestore,functions \
    "${PLAYWRIGHT_CMD[*]}" || EXIT_CODE=$?

if [ $EXIT_CODE -eq 0 ]; then
  echo ""
  echo "Registration E2E tests passed."
else
  echo ""
  echo "Registration E2E tests FAILED (exit $EXIT_CODE)."
fi

exit $EXIT_CODE
