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
#   stdin : JSON { cwd, name, ... }  (name is a slug such as "bold-oak-a3f2")
#   stdout: the absolute worktree path, as the last non-empty line
#   See https://code.claude.com/docs/en/hooks#worktreecreate-input
#
#   The field is `name`. An earlier version read `worktree_name`, which Claude
#   Code never sends, so every hook-created worktree failed with "missing
#   cwd/worktree_name". `worktree_name` is still accepted as a fallback.
#   stderr: everything else (git chatter, diagnostics)
#   exit 0 on success; non-zero aborts creation and shows stderr to the user.
#
set -euo pipefail

input="$(cat)"
cwd="$(printf '%s' "$input" | jq -r '.cwd // empty')"
name="$(printf '%s' "$input" | jq -r '.name // .worktree_name // empty')"
[ -n "$cwd" ] || cwd="${CLAUDE_PROJECT_DIR:-$PWD}"

if [ -z "$name" ]; then
  keys="$(printf '%s' "$input" | jq -r 'keys | join(", ")' 2>/dev/null || echo '?')"
  echo "claude-worktree-create: no worktree name in hook input (keys: $keys)" >&2
  exit 1
fi

# Always anchor on the MAIN checkout, even when Claude runs from inside a
# worktree: the parent of the shared .git dir is the main repo root. Otherwise
# a session started in a worktree would nest new ones under "<worktree>-worktrees".
common_dir="$(git -C "$cwd" rev-parse --path-format=absolute --git-common-dir)"
repo_root="$(dirname "$common_dir")"

# Sibling of the repo: /path/to/foo -> /path/to/foo-worktrees/<name>
base="$(dirname "$repo_root")/$(basename "$repo_root")-worktrees"
path="$base/$name"
branch="worktree-$name"

mkdir -p "$base"
cd "$repo_root"

# Honor the default "fresh" baseRef: branch from origin's default branch.
# Fetch is best-effort so offline creation still works (falls back to HEAD).
git fetch origin --quiet 2>/dev/null || true
base_ref="$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null || true)"
[ -n "$base_ref" ] || base_ref="HEAD"

# All git output to stderr; stdout must carry ONLY the resulting path.
git worktree add "$path" -b "$branch" "$base_ref" 1>&2

printf '%s\n' "$path"
