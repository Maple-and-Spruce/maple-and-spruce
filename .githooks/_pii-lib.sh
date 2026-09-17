# shellcheck shell=bash
# Shared by the git hooks. Runs the PII guard with a local tsx when there is one,
# which starts faster than `npx tsx`.
PII_ROOT="$(git rev-parse --show-toplevel)"
pii_check() {
  if [ -x "$PII_ROOT/node_modules/.bin/tsx" ]; then
    "$PII_ROOT/node_modules/.bin/tsx" "$PII_ROOT/tools/check-no-customer-pii.ts" "$@"
  else
    npx --yes tsx "$PII_ROOT/tools/check-no-customer-pii.ts" "$@"
  fi
}
pii_no_roster_warning() {
  if [ ! -f "$PII_ROOT/.customer-names.local" ] && [ -z "${CUSTOMER_NAMES:-}" ]; then
    echo "⚠ No .customer-names.local — names are NOT being checked. Build it with: npx tsx tools/generate-customer-roster.ts" >&2
  fi
}
