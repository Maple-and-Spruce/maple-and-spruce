#!/usr/bin/env bash
#
# Claude Code PreToolUse hook: stop an agent from publishing customer data.
#
# The git hooks cover what gets committed. They can't see a PR description, an
# issue body or a comment — and those go out in notification emails the moment
# they're posted, before any CI runs, so there is no fixing them afterwards.
# That is where most of the #857 scrub had to happen (9 PR bodies, 4 issues).
#
# Checks, before the tool runs:
#   - Bash: `git commit`, `git push`, `gh pr|issue|release ...`, `gh api` —
#     the command text itself (-m, --body, --title) and any --body-file / -F
#   - Bash `git commit`: the staged files too (in case core.hooksPath is unset)
#   - GitHub MCP write tools: every string in the tool input
#
# Contract: stdin is the hook JSON. Exit 2 blocks the call and shows stderr to
# the agent. Anything that isn't one of the above passes straight through.
#
set -uo pipefail

input="$(cat)"
tool="$(printf '%s' "$input" | jq -r '.tool_name // empty')"
root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
[ -n "$cwd" ] && [ -d "$cwd" ] || cwd="$root"

check() {
  if [ -x "$root/node_modules/.bin/tsx" ]; then
    "$root/node_modules/.bin/tsx" "$root/tools/check-no-customer-pii.ts" "$@"
  else
    npx --yes tsx "$root/tools/check-no-customer-pii.ts" "$@"
  fi
}

block() {
  {
    echo "Blocked by tools/claude-pii-guard.sh: this would publish customer data."
    echo "Rewrite it to describe the shape, not the person (see .claude/rules/customer-privacy.md)."
    echo "Do NOT repeat the flagged value anywhere, including in your reply."
    echo
    cat "$1"
  } >&2
  rm -f "$1"
  exit 2
}

out="$(mktemp)"
trap 'rm -f "$out"' EXIT

case "$tool" in
  Bash)
    cmd="$(printf '%s' "$input" | jq -r '.tool_input.command // empty')"
    if ! printf '%s' "$cmd" | grep -qE '(^|[;&|[:space:]])(git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?(commit|push|tag)|gh[[:space:]]+(pr|issue|release|api|gist))([[:space:]]|$)'; then
      exit 0
    fi

    printf '%s\n' "$cmd" | check --stdin --quiet 2>"$out" || block "$out"

    # Text passed by file: --body-file x, -F x, --notes-file x, git commit -F x
    for f in $(printf '%s' "$cmd" | grep -oE '(--body-file|--notes-file|--file|-F)[= ]+[^ ;&|]+' | sed -E 's/^[^= ]+[= ]+//' | tr -d "'\""); do
      [ "$f" = "-" ] && continue
      case "$f" in /*) p="$f" ;; *) p="$cwd/$f" ;; esac
      [ -f "$p" ] && { check --stdin --quiet <"$p" 2>"$out" || block "$out"; }
    done

    if printf '%s' "$cmd" | grep -qE 'git[[:space:]]+(-C[[:space:]]+[^[:space:]]+[[:space:]]+)?commit'; then
      repo="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null || echo "$cwd")"
      staged=()
      while IFS= read -r -d '' f; do staged+=("$repo/$f"); done < <(git -C "$repo" diff --cached --name-only --diff-filter=ACMR -z 2>/dev/null)
      if [ ${#staged[@]} -gt 0 ]; then
        check --files --quiet "${staged[@]}" 2>"$out" || block "$out"
      fi
    fi
    ;;
  mcp__*[Gg]it[Hh]ub*)
    # Only the tools that write something a person will read.
    case "$tool" in
      *create*|*update*|*write*|*add_*|*push*|*comment*|*reply*|*merge*) ;;
      *) exit 0 ;;
    esac
    printf '%s' "$input" | jq -r '.tool_input | .. | strings' | check --stdin --quiet 2>"$out" || block "$out"
    ;;
esac

exit 0
