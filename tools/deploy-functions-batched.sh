#!/usr/bin/env bash
#
# Deploy a list of Firebase function targets in rate-limit-friendly batches.
#
# Usage:
#   FIREBASE_DEPLOY_TOKEN=<access-token> \
#     tools/deploy-functions-batched.sh <comma-separated-targets> <project-id>
#
# e.g. tools/deploy-functions-batched.sh \
#        "functions:maple-core:getClasses,functions:maple-core:createClass" \
#        maple-and-spruce-dev
#
# ---------------------------------------------------------------------------
# Why this is a separate script and not an inline `run:` block
# ---------------------------------------------------------------------------
# GitHub Actions runs `run:` blocks as `bash -e {0}`. The previous inline
# version added `set -o pipefail` and then did:
#
#     firebase deploy ... | tee log
#     status=${PIPESTATUS[0]}      # <- never reached
#
# With `-e` + pipefail, a failing deploy aborted the step *before* PIPESTATUS
# was read, so the 4-attempt retry loop never ran once in its entire life
# (issue #723: zero `attempt N incomplete` warnings across every failed run,
# each function logged `updating ...` exactly once). Only the exit-0 +
# "unable to queue the operation" path ever retried.
#
# A child script gets a fresh shell, so the caller's `-e` cannot reach in here.
# We deliberately do NOT `set -e` below: failures are handled explicitly.
#
# ---------------------------------------------------------------------------
# Why batching
# ---------------------------------------------------------------------------
# https://docs.cloud.google.com/functions/quotas
#
#   "Insufficient quota generally occurs due to use of a CI/CD system that
#    deploys many functions concurrently or sequentially at a high rate, or use
#    of the Firebase CLI to deploy multiple functions simultaneously."
#
# Two quotas bite, and neither is solved by buying more:
#
#   * gen-2 API WRITE quota is 60 per 60 seconds and CANNOT be increased.
#   * "Total CPU allocation" is a *rate* ("total sum of user-requested CPU
#     across function instances over a 1 minute period"), not a standing
#     reservation — which is why the console reads ~0.5% at idle while a wide
#     deploy still fails with "Container Healthcheck failed. Quota exceeded for
#     total allowable CPU per project per region."
#
# firebase-tools hardcodes deploy concurrency at 40 (release/index.js) with no
# env override, so one `firebase deploy` over ~165 maple-core functions is
# guaranteed to breach both. Google's own first remedy is "reduce deployment
# velocity" — that's what the batching below does.
#
# Normal merges touch a handful of functions and stay a single batch; the cost
# lands only on full-fleet deploys, which today fail outright.
#
# ---------------------------------------------------------------------------
# Why the token is re-minted per attempt
# ---------------------------------------------------------------------------
# `google-github-actions/auth` mints an access token that lives ONE HOUR, and
# the workflow captures it into FIREBASE_DEPLOY_TOKEN once, when the step
# starts. Batching means a full maple-core deploy is 6 batches plus pauses and
# retries — measured at 62 minutes — so the last batch authenticated with a
# token that had already expired:
#
#   Error: Request to cloudresourcemanager.googleapis.com/... HTTP Error: 401,
#   Request had invalid authentication credentials.
#   batch 6/6 (16 function(s)) failed after 4 attempts
#
# Retrying could never fix that: all four attempts reused the same dead token.
# maple-core is the only codebase big enough to cross the hour, which is why it
# alone failed on every merge while the other five shards passed.
#
# So before each attempt we ask gcloud for a fresh token. gcloud holds the
# keyless external_account credential the auth step wrote, and mints a new
# access token on demand — the credential file itself does not expire on this
# timescale. If gcloud is unavailable or fails we keep the token we were given,
# which is exactly the previous behaviour.

set -uo pipefail

TARGETS="${1:-}"
PROJECT="${2:-}"

if [ -z "$TARGETS" ]; then
  echo "No function targets supplied — nothing to deploy."
  exit 0
fi

if [ -z "$PROJECT" ]; then
  echo "::error::deploy-functions-batched.sh: missing project id (arg 2)"
  exit 2
fi

if [ -z "${FIREBASE_DEPLOY_TOKEN:-}" ]; then
  echo "::error::deploy-functions-batched.sh: FIREBASE_DEPLOY_TOKEN is not set"
  exit 2
fi

# Batch of 30 keeps each burst under the uncappable 60-writes/60s ceiling with
# room for the poll traffic. Matches the batch size the Upcover writeup landed
# on after hitting the same wall at ~60 functions.
BATCH_SIZE="${FN_DEPLOY_BATCH_SIZE:-30}"
# Pause between batches. The write quota is a per-minute window, so a short
# gap is enough once each batch is bounded.
BATCH_PAUSE="${FN_DEPLOY_BATCH_PAUSE:-20}"
MAX_ATTEMPTS="${FN_DEPLOY_MAX_ATTEMPTS:-4}"
# Generic retry backoff (transient GCS 5xx on upload, 409 queue contention).
RETRY_BACKOFF="${FN_DEPLOY_RETRY_BACKOFF:-30}"
# Quota errors need to outlast the 1-minute quota window, so back off longer.
QUOTA_BACKOFF="${FN_DEPLOY_QUOTA_BACKOFF:-90}"
# Overridable so the spec can substitute a stub binary.
FIREBASE_CMD="${FN_DEPLOY_FIREBASE_CMD:-pnpm exec firebase}"
# Mints a fresh OAuth access token from the keyless credential gcloud holds.
# Overridable for the same reason as FIREBASE_CMD.
TOKEN_CMD="${FN_DEPLOY_TOKEN_CMD:-gcloud auth print-access-token}"

# Replace FIREBASE_DEPLOY_TOKEN with a freshly minted one.
#
# Best-effort by design: a deploy must not fail because the refresh did, so any
# problem leaves the existing token in place and we carry on. The token is
# never echoed — only whether the refresh worked.
refresh_deploy_token() {
  local fresh
  # shellcheck disable=SC2086  # TOKEN_CMD is a command line; it must split.
  if ! fresh="$($TOKEN_CMD 2>/dev/null)"; then
    echo "--- token refresh unavailable; reusing the existing token"
    return 0
  fi
  # Trim whitespace/newline the CLI appends.
  fresh="${fresh//[$'\t\r\n ']/}"
  if [ -z "$fresh" ]; then
    echo "--- token refresh returned nothing; reusing the existing token"
    return 0
  fi
  if [ "$fresh" != "$FIREBASE_DEPLOY_TOKEN" ]; then
    echo "--- refreshed the deploy token"
  fi
  FIREBASE_DEPLOY_TOKEN="$fresh"
  return 0
}

# Split the comma-separated target list into an array.
IFS=',' read -ra ALL_TARGETS <<<"$TARGETS"
TOTAL=${#ALL_TARGETS[@]}
TOTAL_BATCHES=$(((TOTAL + BATCH_SIZE - 1) / BATCH_SIZE))

echo "Deploying $TOTAL function target(s) to $PROJECT in $TOTAL_BATCHES batch(es) of up to $BATCH_SIZE."

# Deploy one batch, retrying on failure. Echoes progress; returns non-zero when
# every attempt has been exhausted.
deploy_batch() {
  local batch="$1" label="$2"
  local log status attempt backoff

  log="$(mktemp)"
  # shellcheck disable=SC2064  # expand $log now, not at trap time
  trap "rm -f '$log'" RETURN

  for ((attempt = 1; attempt <= MAX_ATTEMPTS; attempt++)); do
    echo "--- $label, attempt $attempt/$MAX_ATTEMPTS"

    # Before EVERY attempt, not just every batch: a long batch plus a quota
    # backoff can straddle the token's expiry on its own.
    refresh_deploy_token

    # Unquoted on purpose: FIREBASE_CMD is a command line ("pnpm exec firebase")
    # that must word-split. The token is passed but never echoed.
    # shellcheck disable=SC2086
    $FIREBASE_CMD deploy \
      --only "$batch" \
      --project "$PROJECT" \
      --force \
      --token "$FIREBASE_DEPLOY_TOKEN" 2>&1 | tee "$log"
    status=${PIPESTATUS[0]}

    # firebase exits 0 while SILENTLY dropping functions that lost a 409 race
    # for the operation queue, so a clean exit code is not sufficient. We
    # deliberately do NOT match "already exists" / "failed to create": those
    # are benign (the function IS deployed, firebase just mis-tracked create vs
    # update) and would make this loop never converge.
    if [ "$status" -eq 0 ] && ! grep -qiE 'unable to queue the operation' "$log"; then
      echo "--- $label succeeded"
      return 0
    fi

    if [ "$attempt" -ge "$MAX_ATTEMPTS" ]; then
      break
    fi

    # A quota breach needs to outlast the 1-minute quota window; anything else
    # (GCS 5xx on upload, 409 contention, WIF token flake — #636) clears fast.
    if grep -qiE 'Quota exceeded|HTTP Error: 429' "$log"; then
      backoff="$QUOTA_BACKOFF"
      echo "::warning::$label hit a quota limit (exit=$status); backing off ${backoff}s"
    else
      backoff="$RETRY_BACKOFF"
      echo "::warning::$label incomplete (exit=$status or 409 contention); retrying in ${backoff}s"
    fi
    sleep "$backoff"
  done

  echo "::error::$label failed after $MAX_ATTEMPTS attempts"
  return 1
}

batch_index=0
for ((i = 0; i < TOTAL; i += BATCH_SIZE)); do
  batch_index=$((batch_index + 1))
  chunk_arr=("${ALL_TARGETS[@]:i:BATCH_SIZE}")
  # Re-join this slice with commas for --only.
  chunk="$(
    IFS=','
    echo "${chunk_arr[*]}"
  )"

  if ! deploy_batch "$chunk" "batch $batch_index/$TOTAL_BATCHES (${#chunk_arr[@]} function(s))"; then
    exit 1
  fi

  # No trailing pause after the final batch.
  if [ "$batch_index" -lt "$TOTAL_BATCHES" ]; then
    echo "--- pausing ${BATCH_PAUSE}s before the next batch (write quota is 60/60s)"
    sleep "$BATCH_PAUSE"
  fi
done

echo "All $TOTAL_BATCHES batch(es) deployed successfully."
