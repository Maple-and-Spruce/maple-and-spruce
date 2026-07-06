#!/usr/bin/env bash
#
# Claude Code WorktreeCreate hook.
#
# Places new worktrees OUTSIDE the repo working tree, in a sibling directory
# "<repo>-worktrees/<name>", instead of Claude's default ".claude/worktrees/"
# inside the repo. Keeps the repo tree clean and avoids nested-worktree tooling
# confusion (git status, coverage globs, file watchers, etc.).
#
# This hook REPLACES Claude's built-in worktree creation, so it re-implements
# the default behavior: a new branch "worktree-<name>" created from the repo's
# default "fresh" base ref (origin's default branch).
#
# Contract (Claude Code):
#   stdin : JSON { cwd, worktree_name, base_path, ... }
#   stdout: the absolute worktree path, and ONLY that (Claude uses it)
#   stderr: everything else (git chatter, diagnostics)
#   exit 0 on success; non-zero aborts creation and shows stderr to the user.
#
set -euo pipefail

input="$(cat)"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
name="$(printf '%s' "$input" | jq -r '.worktree_name // empty')"

if [ -z "$cwd" ] || [ -z "$name" ]; then
  echo "claude-worktree-create: missing cwd/worktree_name in hook input" >&2
  exit 1
fi

# Sibling of the repo: /path/to/foo -> /path/to/foo-worktrees/<name>
base="$(dirname "$cwd")/$(basename "$cwd")-worktrees"
path="$base/$name"
branch="worktree-$name"

mkdir -p "$base"
cd "$cwd"

# Honor the default "fresh" baseRef: branch from origin's default branch.
# Fetch is best-effort so offline creation still works (falls back to HEAD).
git fetch origin --quiet 2>/dev/null || true
base_ref="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
[ -n "$base_ref" ] || base_ref="HEAD"

# All git output to stderr; stdout must carry ONLY the resulting path.
git worktree add "$path" -b "$branch" "$base_ref" 1>&2

printf '%s\n' "$path"
