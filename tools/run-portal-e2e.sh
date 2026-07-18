#!/usr/bin/env bash
#
# Run the admin-portal role-scoping E2E against local Firebase emulators.
#
# Drives the real Next.js app (apps/maple-spruce) in a browser: sign in through
# the login form, assert the role-filtered shell (nav + gate). The emulators
# run auth + firestore + functions with THIS checkout's code; Playwright's own
# webServer boots `next dev`, pointed at the emulator ports.
#
# Unlike the MT e2e, no Square/Webflow/Etsy is needed for the login/nav flow —
# external integrations are pointed at closed ports so any stray call fails
# fast instead of hitting a real service.
#
# Usage:
#   ./tools/run-portal-e2e.sh            # headless
#   ./tools/run-portal-e2e.sh --ui       # Playwright UI mode
#   ./tools/run-portal-e2e.sh --debug    # Playwright debug mode
#
# Port isolation: respects EMULATOR_PORT_OFFSET so parallel worktrees don't
# collide. Prerequisites: Java 21+, pnpm.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$ROOT_DIR"

OFFSET="${EMULATOR_PORT_OFFSET:-0}"
FUNCTIONS_PORT=$((5001 + OFFSET))
FIRESTORE_PORT=$((8080 + OFFSET))
AUTH_PORT=$((9099 + OFFSET))
UI_PORT=$((4000 + OFFSET))
# Next dev is pinned to 3000 (nx dev target doesn't reliably take a port); only
# emulator ports take the offset. Parallel portal-e2e runs would collide on
# 3000 — rare, and the port-kill below clears a stale one.
NEXT_PORT=3000

PLAYWRIGHT_EXTRA_ARGS=()
case "${1:-}" in
  --ui)    PLAYWRIGHT_EXTRA_ARGS+=("--ui") ;;
  --debug) PLAYWRIGHT_EXTRA_ARGS+=("--debug") ;;
esac

# Kill stale processes on OUR ports (leave other worktrees alone).
for port in "$FUNCTIONS_PORT" "$FIRESTORE_PORT" "$AUTH_PORT" "$UI_PORT" "$NEXT_PORT"; do
  lsof -ti:"$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
done
sleep 1

echo "Building function codebases…"
pnpm exec nx reset 2>/dev/null || true
pnpm exec nx run-many \
  --target=build \
  --projects=functions,functions-calendar,functions-square,functions-sync \
  --parallel=4

echo "Setting up emulator environment…"
for dir in dist/apps/functions dist/apps/functions-square dist/apps/functions-sync dist/apps/functions-calendar; do
  grep -v '^#' .env.dev | grep -v '^$' > "$dir/.env"
done

# Secrets: mock values so the emulator doesn't hang on missing defineSecret
# params (see .claude/rules/firebase-functions.md — a missing secret silently
# stalls the emulator on a stdin prompt).
printf "ETSY_API_KEY=fake\nETSY_SHARED_SECRET=fake\nTALLY_WEBHOOK_SECRET=test\nGA4_API_SECRET=test\nMETA_CAPI_TOKEN=test\n" > dist/apps/functions/.secret.local
printf "SQUARE_ACCESS_TOKEN=mock-token\nMT_SQUARE_ACCESS_TOKEN=mock-token\nSQUARE_WEBHOOK_SIGNATURE_KEY=mock-key\nETSY_API_KEY=fake\nETSY_SHARED_SECRET=fake\n" > dist/apps/functions-square/.secret.local
printf "WEBFLOW_API_TOKEN=mock-token\nETSY_API_KEY=fake\nETSY_SHARED_SECRET=fake\n" > dist/apps/functions-sync/.secret.local

# Point external integrations at a closed port so any stray call fails fast.
echo "SQUARE_BASE_URL=http://127.0.0.1:1" >> dist/apps/functions-square/.env
echo "WEBFLOW_BASE_URL=http://127.0.0.1:1" >> dist/apps/functions-sync/.env
echo "ETSY_API_BASE=http://127.0.0.1:1" >> dist/apps/functions-sync/.env

# CORS: the app's callables come from the Next dev origin — allow it.
APP_ORIGINS="http://localhost:$NEXT_PORT,http://127.0.0.1:$NEXT_PORT"
for dir in dist/apps/functions dist/apps/functions-square dist/apps/functions-sync dist/apps/functions-calendar; do
  EXISTING=$(grep '^ALLOWED_ORIGINS=' "$dir/.env" | head -1 | cut -d= -f2-)
  echo "ALLOWED_ORIGINS=$EXISTING,$APP_ORIGINS" >> "$dir/.env"
done

# The Next app reads emulator ports from .env.local — the one channel that
# reliably reaches the browser bundle (webServer.env / process.env NEXT_PUBLIC
# vars don't propagate through `nx → next dev` into the client). Gitignored;
# removed on exit.
cat > apps/maple-spruce/.env.local <<EOF
NEXT_PUBLIC_FUNCTIONS_EMULATOR_PORT=$FUNCTIONS_PORT
NEXT_PUBLIC_AUTH_EMULATOR_PORT=$AUTH_PORT
EOF
cleanup() { rm -f apps/maple-spruce/.env.local; }
trap cleanup EXIT

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

PLAYWRIGHT_CMD=(pnpm exec nx run maple-spruce-e2e:e2e)
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
  echo "Portal E2E tests passed."
else
  echo ""
  echo "Portal E2E tests FAILED (exit $EXIT_CODE)."
fi

exit $EXIT_CODE
