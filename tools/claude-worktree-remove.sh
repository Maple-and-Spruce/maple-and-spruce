#!/usr/bin/env bash
#
# Claude Code WorktreeRemove hook.
#
# Cleans up the external worktree created by claude-worktree-create.sh. Runs for
# side effects only (Claude ignores the exit code), and is idempotent: if Claude
# already removed the worktree, this is a harmless no-op.
#
# Contract (Claude Code):
#   stdin : JSON { cwd, worktree_path, ... }
#   exit code is ignored.
#
set -euo pipefail

input="$(cat)"
path="$(printf '%s' "$input" | jq -r '.worktree_path // empty')"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"

[ -n "$path" ] || exit 0
[ -n "$cwd" ] && cd "$cwd" 2>/dev/null || true

git worktree remove --force "$path" >/dev/null 2>&1 || true

# Also delete the branch, but ONLY for worktrees this hook created: those live
# in a sibling "<repo>-worktrees/" dir and use a "worktree-<name>" branch.
# Scoping to that convention avoids ever force-deleting an unrelated branch.
case "$(basename "$(dirname "$path")")" in
  *-worktrees)
    git branch -D "worktree-$(basename "$path")" >/dev/null 2>&1 || true
    ;;
esac
