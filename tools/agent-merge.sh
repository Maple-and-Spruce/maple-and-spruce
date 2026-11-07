#!/usr/bin/env bash
# The only way an agent merges a PR. See docs/process/pipeline.md → Ship.
#
# Merging to main deploys to prod, so this refuses unless all of these hold
# on the PR's current head commit:
#   - labelled agent-built and lane:invisible or lane:dark
#   - no for:david, for:katie, needs-review or blocked label
#   - not a draft, and mergeable
#   - every check run finished, none failed (Autonomy lane and Claude review
#     included, and both must be present)
#
# REST only: cloud sessions block the GraphQL API that `gh pr` uses.
#
#   tools/agent-merge.sh <pr-number>
#
# Exit codes: 0 merged · 2 not allowed (a person decides) · 3 checks not done
# yet (try again later) · 4 checks failed or missing.
set -euo pipefail

PR="${1:?usage: tools/agent-merge.sh <pr-number>}"
REPO="${AGENT_MERGE_REPO:-Maple-and-Spruce/maple-and-spruce}"
REQUIRED_CHECKS=("Autonomy lane" "Claude review")

pr=$(gh api "repos/$REPO/pulls/$PR")
sha=$(jq -r .head.sha <<<"$pr")
labels=$(jq -r '[.labels[].name] | join(",")' <<<"$pr")
has() { [[ ",$labels," == *",$1,"* ]]; }

refuse() { echo "Not merging #$PR: $1" >&2; exit "${2:-2}"; }

[ "$(jq -r .state <<<"$pr")" = open ] || refuse "it is not open."
[ "$(jq -r .draft <<<"$pr")" = false ] || refuse "it is a draft."
has agent-built || refuse "it is not labelled agent-built."
if ! has lane:invisible && ! has lane:dark; then
  refuse "only lane:invisible and lane:dark PRs merge themselves (labels: $labels)."
fi
for l in for:david for:katie needs-review blocked; do
  if has "$l"; then refuse "it is labelled $l."; fi
done

# Every run on this commit, then the latest run per check that was not skipped.
# A label event re-runs "Claude review" as skipped; that must not hide the real
# result, and an old failure must not outlive a later pass.
runs=$(gh api "repos/$REPO/commits/$sha/check-runs?filter=all&per_page=100" --paginate \
  --jq '.check_runs[]' | jq -rs '
    map(select(.conclusion != "skipped"))
    | group_by(.name)
    | map(max_by(.started_at))
    | .[] | [.name, .status, (.conclusion // "")] | @tsv')

for name in "${REQUIRED_CHECKS[@]}"; do
  grep -q "^$name	" <<<"$runs" || refuse "the \"$name\" check has not run on $sha." 4
done
pending=$(awk -F'\t' '$2 != "completed" { print $1 }' <<<"$runs")
[ -z "$pending" ] || refuse "checks still running: $(tr '\n' ',' <<<"$pending")" 3
failed=$(awk -F'\t' '$3 !~ /^(success|neutral)$/ { print $1 " (" $3 ")" }' <<<"$runs")
[ -z "$failed" ] || refuse "checks failed: $(tr '\n' ',' <<<"$failed")" 4
for name in "${REQUIRED_CHECKS[@]}"; do
  grep -q "^$name	completed	success$" <<<"$runs" || refuse "\"$name\" did not pass on $sha." 4
done

mergeable=$(gh api "repos/$REPO/pulls/$PR" --jq .mergeable)
[ "$mergeable" = true ] || refuse "GitHub says it is not mergeable ($mergeable); rebase first." 4

title=$(jq -r .title <<<"$pr")
gh api -X PUT "repos/$REPO/pulls/$PR/merge" \
  -f merge_method=squash -f sha="$sha" -f commit_title="$title (#$PR)" >/dev/null
echo "Merged #$PR at $sha."
