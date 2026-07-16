#!/usr/bin/env bash
#
# Run the Music Together enrollment FE→BE E2E against local Firebase emulators.
#
# Mirrors tools/run-registration-e2e.sh. Drives the MusicTogetherRegistrationWidget
# (mounted in the shared registration-test-harness via ?mtSectionId=) against the
# emulator, the harness Vite server, and MT's Square sandbox.
#
# Two Square modes, chosen automatically:
#   - REAL MT sandbox — if MT_SQUARE_ACCESS_TOKEN is already exported in your
#     shell (a real MT sandbox token). The function charges MT's real sandbox
#     account and the spec's MT-routing assertion runs.
#   - MOCK Square      — otherwise. A local Square mock server is started and the
#     MT Square client is pointed at it via SQUARE_BASE_URL (token = mock-token).
#     The full browser→function→confirmation flow still runs; only the real
#     charge + routing assertion are skipped (they self-skip without a token).
#
# The widget still tokenizes against MT's REAL Square sandbox app in BOTH modes
# (MT_SQUARE_APPLICATION_ID is public, in .env.dev), so a network connection is
# required.
#
# Usage:
#   ./tools/run-music-together-e2e.sh            # headless
#   ./tools/run-music-together-e2e.sh --ui       # Playwright UI mode
#   ./tools/run-music-together-e2e.sh --debug    # Playwright debug mode
#
# Port isolation: respects EMULATOR_PORT_OFFSET (source .env.worktree) so
# parallel worktrees never collide.
#
# Prerequisites: Java 21+, pnpm, network access (for Square tokenize).
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
SQUARE_MOCK_PORT=$((9997 + OFFSET))

PLAYWRIGHT_EXTRA_ARGS=()
case "${1:-}" in
  --ui)    PLAYWRIGHT_EXTRA_ARGS+=("--ui") ;;
  --debug) PLAYWRIGHT_EXTRA_ARGS+=("--debug") ;;
esac

# Kill stale processes on OUR ports (leave other worktrees alone).
for port in "$FUNCTIONS_PORT" "$FIRESTORE_PORT" "$AUTH_PORT" "$UI_PORT" "$HARNESS_PORT" "$SQUARE_MOCK_PORT"; do
  lsof -ti:"$port" 2>/dev/null | xargs kill -9 2>/dev/null || true
done
sleep 1

echo "Building function codebases…"
pnpm exec nx reset 2>/dev/null || true
pnpm exec nx run-many \
  --target=build \
  --projects=functions,functions-calendar,functions-square,functions-sync \
  --parallel=4

# Decide Square mode.
USE_REAL_MT_SQUARE=false
if [ -n "${MT_SQUARE_ACCESS_TOKEN:-}" ]; then
  USE_REAL_MT_SQUARE=true
  echo "MT Square: REAL sandbox (MT_SQUARE_ACCESS_TOKEN provided)."
else
  echo "MT Square: MOCK (no MT_SQUARE_ACCESS_TOKEN in env)."
fi

echo "Setting up emulator environment…"
for dir in dist/apps/functions dist/apps/functions-square dist/apps/functions-sync dist/apps/functions-calendar; do
  grep -v '^#' .env.dev | grep -v '^$' > "$dir/.env"
done
echo "ETSY_API_BASE=http://127.0.0.1:1/v3/application" >> dist/apps/functions/.env
printf "ETSY_API_KEY=fake\nETSY_SHARED_SECRET=fake\nTALLY_WEBHOOK_SECRET=test\nGA4_API_SECRET=test\nMETA_CAPI_TOKEN=test\n" > dist/apps/functions/.secret.local

# functions-square holds BOTH the default (M&S) and MT Square clients.
MT_TOKEN_VALUE="${MT_SQUARE_ACCESS_TOKEN:-mock-token}"
printf "SQUARE_ACCESS_TOKEN=mock-token\nMT_SQUARE_ACCESS_TOKEN=%s\nSQUARE_WEBHOOK_SIGNATURE_KEY=mock-key\nETSY_API_KEY=fake\nETSY_SHARED_SECRET=fake\n" "$MT_TOKEN_VALUE" > dist/apps/functions-square/.secret.local

if [ "$USE_REAL_MT_SQUARE" = false ]; then
  # Point BOTH Square clients at the local mock server. The MT client honors
  # SQUARE_BASE_URL just like the default one (see square.utility.ts).
  echo "SQUARE_BASE_URL=http://localhost:${SQUARE_MOCK_PORT}" >> dist/apps/functions-square/.env
fi

# Webflow/Etsy → closed ports so the MT section-write triggers fail fast.
echo "WEBFLOW_BASE_URL=http://127.0.0.1:1" >> dist/apps/functions-sync/.env
echo "ETSY_API_BASE=http://127.0.0.1:1" >> dist/apps/functions-sync/.env
echo "ETSY_TOKEN_URL=http://127.0.0.1:1" >> dist/apps/functions-sync/.env
printf "WEBFLOW_API_TOKEN=mock-token\nETSY_API_KEY=fake\nETSY_SHARED_SECRET=fake\n" > dist/apps/functions-sync/.secret.local

# CORS: add the harness origin to every codebase.
HARNESS_ORIGINS="http://127.0.0.1:$HARNESS_PORT,http://localhost:$HARNESS_PORT"
for dir in dist/apps/functions dist/apps/functions-square dist/apps/functions-sync dist/apps/functions-calendar; do
  EXISTING=$(grep '^ALLOWED_ORIGINS=' "$dir/.env" | head -1 | cut -d= -f2-)
  echo "ALLOWED_ORIGINS=$EXISTING,$HARNESS_ORIGINS" >> "$dir/.env"
done

# Start the Square mock server in mock mode.
SQUARE_MOCK_PID=""
if [ "$USE_REAL_MT_SQUARE" = false ]; then
  echo "Starting Square mock server on port ${SQUARE_MOCK_PORT} ..."
  SQUARE_MOCK_SERVER_PORT="$SQUARE_MOCK_PORT" npx tsx libs/firebase/square-test-mock-server/start.ts &
  SQUARE_MOCK_PID=$!
  sleep 2
fi
cleanup() { [ -n "$SQUARE_MOCK_PID" ] && kill "$SQUARE_MOCK_PID" 2>/dev/null || true; }
trap cleanup EXIT

# Harness: MT Square public IDs (widget tokenizes against MT's sandbox app).
export VITE_MT_SQUARE_APPLICATION_ID=$(grep '^MT_SQUARE_APPLICATION_ID=' .env.dev | cut -d= -f2-)
export VITE_MT_SQUARE_LOCATION_ID=$(grep '^MT_SQUARE_LOCATION_ID=' .env.dev | cut -d= -f2-)
# Routing assertion inputs (spec self-skips it when the token is absent).
export MT_SQUARE_LOCATION_ID=$(grep '^MT_SQUARE_LOCATION_ID=' .env.dev | cut -d= -f2-)
export MT_SQUARE_ENV=$(grep '^MT_SQUARE_ENV=' .env.dev | cut -d= -f2-)

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

PLAYWRIGHT_CMD=(pnpm exec nx run music-together-e2e:e2e)
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
  echo "Music Together E2E tests passed."
else
  echo ""
  echo "Music Together E2E tests FAILED (exit $EXIT_CODE)."
fi

exit $EXIT_CODE
