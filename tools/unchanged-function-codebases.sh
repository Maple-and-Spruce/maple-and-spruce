#!/usr/bin/env bash
#
# Print (as a JSON array) the affected function codebases whose built bundle is
# byte-identical to the one built from the base commit, so the merge deploy can
# leave them alone.
#
# Usage (from the repo root, AFTER the affected codebases are built at HEAD):
#   tools/unchanged-function-codebases.sh <base-commit> '<affected-codebases-json>'
#
# e.g. tools/unchanged-function-codebases.sh HEAD~1 '["maple-core","maple-square"]'
#   -> ["maple-square"]
#
# Logs go to stderr; stdout is only ever the JSON array. Any doubt at all —
# a missing base, a failed base build, a changed deploy input — means "changed",
# so the worst case is today's behaviour: redeploy.
#
# ---------------------------------------------------------------------------
# Why
# ---------------------------------------------------------------------------
# Every function deploy creates a new Cloud Run revision, and Cloud Run boots one
# instance of every new revision, with startup CPU boost (2 vCPU), whether or not
# anything calls it. That costs ~23 vCPU-seconds per function per project. It is
# what the "CPU (Request-based billing)" spike on merge days is. On 2026-10-09,
# 25 merges made 2,598 prod revisions (~16 per function) and 17.5 vCPU-hours,
# against ~1.1 on a day with no deploys.
#
# 43% of those revisions (2,428 of 5,671 in prod, Oct 1-12; dev the same) carried
# the same `firebase-functions-hash` label as the revision they replaced. In other
# words, the same code was deployed again. Two things cause that:
#
#   * nx marks every function that imports a shared lib as affected, even when
#     the change (a type, a React component, a test) never reaches a bundle.
#   * Each codebase is ONE bundle, so whether a function's code changed is a
#     property of its codebase, not of the function.
#
# firebase-tools already skips unchanged functions by that hash, but only for
# functions NOT named in `--only` (`targetedByOnly`, release/planner.js). Even
# a codebase-level filter counts as naming them. CI always passes `--only`
# (the library name IS the deploy filter, see .claude/rules/firebase-functions.md),
# so that skip never runs here. This script is the same check, done one level
# up: build the base commit's bundle and compare.
#
# ---------------------------------------------------------------------------
# What counts as "the same"
# ---------------------------------------------------------------------------
#   * Every file in dist/apps/<project>, except `pnpm-lock.yaml` (deleted before
#     upload) and `*.d.ts` (type declarations, never executed).
#   * None of DEPLOY_INPUTS changed between base and HEAD. Those reach a deploy
#     without passing through the bundle: the env files copied in at deploy
#     time, the runtime/deps config, and the deploy machinery itself.
#
# Secrets are not covered: a deploy pins the secret version it resolved. After
# rotating a secret, run the workflow by hand with `deploy_all`, which bypasses
# this check.

set -uo pipefail

BASE="${1:-}"
CODEBASES_JSON="${2:-[]}"

# Overridable so the spec can substitute a stub build.
NX_CMD="${UNCHANGED_FN_NX_CMD:-pnpm exec nx}"

DEPLOY_INPUTS=(
  .env.dev
  .env.prod
  firebase.json
  function-codebases.json
  package.json
  pnpm-lock.yaml
  pnpm-workspace.yaml
  .github/workflows/firebase-functions-merge.yml
  tools/deploy-functions-batched.sh
)

log() { echo "$*" >&2; }

# "<blob hash> <path>" for every file that reaches the runtime, sorted by path.
# Directories don't count, so a folder holding only declarations can't differ.
bundle_manifest() {
  (
    cd "$1" || exit 1
    find . -type f ! -name pnpm-lock.yaml ! -name '*.d.ts' | LC_ALL=C sort |
      while IFS= read -r f; do echo "$(git hash-object --no-filters "$f") $f"; done
  )
}

none() {
  log "$1 — not skipping any codebase"
  echo '[]'
  exit 0
}

[ -n "$BASE" ] || none "no base commit given"
[ -f function-codebases.json ] || none "function-codebases.json not found (run from the repo root)"
git cat-file -e "${BASE}^{commit}" 2>/dev/null || none "base commit $BASE is not available"

if ! git diff --quiet "$BASE" HEAD -- "${DEPLOY_INPUTS[@]}"; then
  none "a deploy input changed since $BASE ($(git diff --name-only "$BASE" HEAD -- "${DEPLOY_INPUTS[@]}" | tr '\n' ' '))"
fi

WORK="$(mktemp -d)"
BASE_DIR="$WORK/base"
cleanup() {
  git worktree remove --force "$BASE_DIR" >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

git worktree add --detach "$BASE_DIR" "$BASE" >&2 2>&1 || none "could not check out $BASE"

# The lockfile is identical (checked above), so HEAD's install serves the base
# build too. pnpm's links inside node_modules are relative, so a symlink to the
# directory works.
if [ -d node_modules ]; then
  ln -s "$PWD/node_modules" "$BASE_DIR/node_modules"
fi

UNCHANGED=()
for CODEBASE in $(echo "$CODEBASES_JSON" | jq -r '.[]'); do
  PROJECT=$(jq -r --arg cb "$CODEBASE" '.codebaseProjects[$cb] // empty' function-codebases.json)
  if [ -z "$PROJECT" ] || [ ! -d "dist/apps/$PROJECT" ]; then
    log "$CODEBASE: no HEAD build at dist/apps/$PROJECT — deploying"
    continue
  fi

  log "$CODEBASE: building $PROJECT at $BASE to compare"
  # shellcheck disable=SC2086  # NX_CMD is a command line; it must word-split.
  if ! (cd "$BASE_DIR" && NX_DAEMON=false $NX_CMD run "$PROJECT:build" --skip-nx-cache) >&2 2>&1; then
    log "$CODEBASE: base build failed — deploying"
    continue
  fi

  if diff <(bundle_manifest "dist/apps/$PROJECT") \
    <(bundle_manifest "$BASE_DIR/dist/apps/$PROJECT") >&2; then
    log "$CODEBASE: bundle identical to $BASE — skipping its deploy"
    UNCHANGED+=("$CODEBASE")
  else
    log "$CODEBASE: bundle changed — deploying"
  fi
done

if [ ${#UNCHANGED[@]} -eq 0 ]; then
  echo '[]'
else
  printf '%s\n' "${UNCHANGED[@]}" | jq -R . | jq -sc .
fi
