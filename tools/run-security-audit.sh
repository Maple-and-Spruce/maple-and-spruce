#!/usr/bin/env bash
#
# CI security audit (build-check.yml -> Security Audit job).
#
# Runs `pnpm audit --audit-level=high` so that a REGISTRY-side failure does not
# red-X an unrelated PR, while a real advisory still does.
#
# Why this isn't just `pnpm audit` inline any more: pnpm POSTs the entire
# dependency tree (2,380 packages) to npm's /-/npm/v1/security/advisories/bulk
# endpoint. That call times out often enough to fail PRs on its own -- it took
# down the Security Audit job on #801 after 4m42s, and reproduced twice locally
# on 2026-09-04. pnpm retries it 3 times internally and then throws
# `TimeoutError: The operation was aborted due to timeout`, exit code 1, which
# is indistinguishable at the shell from "we found a critical CVE".
#
# `--ignore-registry-errors` is pnpm's own switch for this. It wraps ONLY the
# fetch of the report (see the try/catch around `audit()` in pnpm's audit
# handler), so advisories in a report that did arrive still exit non-zero --
# the guardrail keeps its teeth.
#
# The cost of that flag on its own is silence: a green check that audited
# nothing. So we retry first (these outages are usually short), and if no
# report ever arrives we say so with a GitHub warning annotation rather than
# passing without a trace.
#
# Worst case on a sustained outage is ~3 x 4min of runner time before the
# warning. That only happens while the registry is down; a healthy run returns
# in seconds.
#
# Local use: ./tools/run-security-audit.sh   (same check CI runs)
#
set -uo pipefail

ATTEMPTS="${AUDIT_ATTEMPTS:-3}"
BACKOFF_SECONDS="${AUDIT_BACKOFF_SECONDS:-10}"
PNPM_BIN="${PNPM_BIN:-pnpm}"

attempt=1
while [ "$attempt" -le "$ATTEMPTS" ]; do
  output="$("$PNPM_BIN" audit --audit-level=high --ignore-registry-errors 2>&1)"
  status=$?
  printf '%s\n' "$output"

  # Non-zero here means the report arrived and contained advisories at or above
  # `high` (or pnpm itself was misconfigured). Either way, fail the job.
  if [ "$status" -ne 0 ]; then
    exit "$status"
  fi

  # A report that arrived always says something about vulnerabilities -- either
  # "No known vulnerabilities found" or "N vulnerabilities found". A registry
  # error swallowed by --ignore-registry-errors prints only the thrown message
  # ("The operation was aborted due to timeout"), so this is what tells the two
  # exit-0 cases apart.
  if printf '%s' "$output" | grep -qi 'vulnerabilit'; then
    exit 0
  fi

  if [ "$attempt" -lt "$ATTEMPTS" ]; then
    echo "Audit registry error (attempt ${attempt}/${ATTEMPTS}); retrying in ${BACKOFF_SECONDS}s..." >&2
    sleep "$BACKOFF_SECONDS"
  fi
  attempt=$((attempt + 1))
done

message="pnpm audit could not reach the npm advisories endpoint after ${ATTEMPTS} attempts, so no audit ran for this commit. Not failing the build on a registry outage -- re-run this job once the registry recovers."
echo "::warning title=Security audit skipped (registry unreachable)::${message}"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  echo "### :warning: Security audit skipped" >> "$GITHUB_STEP_SUMMARY"
  echo "" >> "$GITHUB_STEP_SUMMARY"
  echo "$message" >> "$GITHUB_STEP_SUMMARY"
fi
exit 0
