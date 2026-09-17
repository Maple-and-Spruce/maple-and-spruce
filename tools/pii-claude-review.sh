#!/usr/bin/env bash
#
# Ask Claude whether a range of commits adds real customer data.
#
# The roster check only knows the people in production today. This is the
# second opinion for everything else: a lead who never became a student, a
# name spelled differently, a pasted Square export, a real family's story in a
# docs paragraph. It reads only the ADDED lines, never the lockfile.
#
#   tools/pii-claude-review.sh origin/main..HEAD
#
# Advisory by design: if `claude` is missing, offline or unsure, it warns and
# lets the push through — the deterministic checks are the ones that block.
# It blocks only on an explicit LEAK verdict.
#
#   PII_REVIEW=off              skip it
#   PII_REVIEW_MODEL=sonnet     use a different model (default: haiku)
#
set -uo pipefail

range="${1:?usage: pii-claude-review.sh <range>}"

if [ "${PII_REVIEW:-on}" = "off" ]; then exit 0; fi
if ! command -v claude >/dev/null 2>&1; then
  echo "ℹ pii-claude-review: claude CLI not found, skipping the AI review." >&2
  exit 0
fi

added="$(git diff --unified=0 --no-color "$range" -- . \
  ':!pnpm-lock.yaml' ':!**/package-lock.json' ':!function-count-baseline.json' \
  | grep -E '^(\+\+\+ |\+)' | grep -vE '^\+\+\+ /dev/null' | head -c 200000)"
[ -z "$added" ] && exit 0

read -r -d '' prompt <<'PROMPT'
You are a privacy reviewer for a small music-and-arts studio's codebase. The
studio's customers are families, often with children. Real customer data must
never be committed: not in code, tests, fixtures, stories, docs or messages.

Below are the lines ADDED by a git push (file headers start with "+++").
Decide whether any line contains data that looks copied from a real person:
a real-seeming full name tied to a lesson, card, schedule or family detail; a
personal email or phone number; a home address; a real payment detail; a
narrative about a specific identifiable customer.

NOT a leak: obviously invented fixture names (Test Student, Ada Lovelace, Robin
Ashfield), @example.com addresses, 555 phone numbers, staff (Katie, Nathan,
Stephanie Zucker, David), artists and instructors named on the public website,
and library/author names in code.

Reply with EXACTLY one first line, either
VERDICT: CLEAN
or
VERDICT: LEAK
If LEAK, follow with one line per finding as "<file> — <why>" and DO NOT
repeat the name, email, or number itself.
PROMPT

echo "… pii-claude-review: asking Claude (${PII_REVIEW_MODEL:-haiku}) about $range" >&2
# A bare session: no tools, MCP servers, plugins, skills or user settings. A
# fully loaded profile can be bigger than the model's context window on its own.
reply="$(printf '%s\n' "$added" | claude -p "Review the added lines below. Answer in the required format." \
  --system-prompt "$prompt" \
  --model "${PII_REVIEW_MODEL:-haiku}" \
  --tools "" --strict-mcp-config --disable-slash-commands --setting-sources "" \
  --no-session-persistence 2>/dev/null)"
status=$?

if [ $status -ne 0 ] || [ -z "$reply" ]; then
  echo "⚠ pii-claude-review: no answer from claude (exit $status). Not blocking." >&2
  exit 0
fi

first="$(printf '%s\n' "$reply" | grep -m1 -E '^VERDICT:' || true)"
case "$first" in
  "VERDICT: CLEAN")
    echo "✓ pii-claude-review: clean." >&2
    exit 0
    ;;
  "VERDICT: LEAK")
    echo "✗ pii-claude-review: Claude thinks this push adds real customer data:" >&2
    printf '%s\n' "$reply" | sed -n '/^VERDICT:/,$p' | tail -n +2 >&2
    echo "  Fix it, or if it's a false alarm: PII_REVIEW=off git push" >&2
    exit 1
    ;;
  *)
    echo "⚠ pii-claude-review: unclear answer, not blocking. First line: ${first:-<none>}" >&2
    exit 0
    ;;
esac
