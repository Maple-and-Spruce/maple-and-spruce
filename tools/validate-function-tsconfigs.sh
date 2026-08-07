#!/usr/bin/env bash
#
# Validates that each function codebase's tsconfig.app.json includes all
# function libraries exported from its entry point.
#
# Usage: ./tools/validate-function-tsconfigs.sh [--fix]
#
# With --fix, automatically adds missing includes to tsconfig.app.json files.

set -eo pipefail

FIX=false
if [[ "${1:-}" == "--fix" ]]; then
  FIX=true
fi

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

ERRORS=0

APP_DIRS=("apps/functions" "apps/functions-calendar" "apps/functions-square" "apps/functions-sync" "apps/functions-webhooks")

check_codebase() {
  local APP_DIR="$1"
  local ENTRY="${APP_DIR}/src/index.ts"
  local TSCONFIG="${APP_DIR}/tsconfig.app.json"

  if [[ ! -f "$ENTRY" ]]; then
    echo -e "${YELLOW}SKIP${NC} $ENTRY not found"
    return
  fi

  if [[ ! -f "$TSCONFIG" ]]; then
    echo -e "${RED}FAIL${NC} $TSCONFIG not found"
    ERRORS=$((ERRORS + 1))
    return
  fi

  # Extract function library slugs from entry point imports
  # Matches: from '@maple/firebase/maple-functions/some-function'
  local IMPORTED_SLUGS
  IMPORTED_SLUGS=$(grep -oE "from '@maple/firebase/maple-functions/[^']+'" "$ENTRY" | sed "s/from '@maple\/firebase\/maple-functions\///" | sed "s/'//" | sort -u || true)

  if [[ -z "$IMPORTED_SLUGS" ]]; then
    echo -e "${GREEN}OK${NC}   $APP_DIR — no function imports"
    return
  fi

  local MISSING=()
  while IFS= read -r SLUG; do
    [[ -z "$SLUG" ]] && continue
    local EXPECTED_INCLUDE="../../libs/firebase/maple-functions/${SLUG}/**/*.ts"
    if ! grep -qF "$EXPECTED_INCLUDE" "$TSCONFIG"; then
      MISSING+=("$SLUG")
    fi
  done <<< "$IMPORTED_SLUGS"

  if [[ ${#MISSING[@]} -eq 0 ]]; then
    local COUNT
    COUNT=$(echo "$IMPORTED_SLUGS" | wc -l | tr -d ' ')
    echo -e "${GREEN}OK${NC}   $APP_DIR — all $COUNT function includes present"
  else
    echo -e "${RED}FAIL${NC} $APP_DIR — missing ${#MISSING[@]} include(s):"
    for SLUG in "${MISSING[@]}"; do
      echo "       ../../libs/firebase/maple-functions/${SLUG}/**/*.ts"
    done
    ERRORS=$((ERRORS + ${#MISSING[@]}))

    if [[ "$FIX" == true ]]; then
      for SLUG in "${MISSING[@]}"; do
        local INCLUDE_PATH="../../libs/firebase/maple-functions/${SLUG}/**/*.ts"
        # Insert before the first shared lib include (../../libs/firebase/database)
        if grep -q '../../libs/firebase/database' "$TSCONFIG"; then
          sed -i '' "/\.\.\/\.\.\/libs\/firebase\/database/i\\
    \"${INCLUDE_PATH}\"," "$TSCONFIG"
        else
          sed -i '' "/\"src\/\*\*\/\*\.ts\"/a\\
    \"${INCLUDE_PATH}\"," "$TSCONFIG"
        fi
      done
      echo -e "       ${GREEN}FIXED${NC} — added missing includes"
    fi
  fi
}

for APP_DIR in "${APP_DIRS[@]}"; do
  check_codebase "$APP_DIR"
done

# Validate function-codebases.json consistency
echo ""
echo "Checking function-codebases.json consistency..."

MAPPING_FILE="function-codebases.json"
if [[ ! -f "$MAPPING_FILE" ]]; then
  echo -e "${RED}FAIL${NC} $MAPPING_FILE not found"
  exit 1
fi

# Check that every non-core function export has a mapping
NON_CORE_DIRS=("apps/functions-calendar" "apps/functions-square" "apps/functions-sync" "apps/functions-webhooks")
for APP_DIR in "${NON_CORE_DIRS[@]}"; do
  ENTRY="${APP_DIR}/src/index.ts"
  [[ ! -f "$ENTRY" ]] && continue

  IMPORTED_SLUGS=$(grep -oE "from '@maple/firebase/maple-functions/[^']+'" "$ENTRY" | sed "s/from '@maple\/firebase\/maple-functions\///" | sed "s/'//" | sort -u || true)
  while IFS= read -r SLUG; do
    [[ -z "$SLUG" ]] && continue
    LIB_NAME="firebase-maple-functions-${SLUG}"
    if ! jq -e --arg lib "$LIB_NAME" '.functionToCodebase[$lib]' "$MAPPING_FILE" > /dev/null 2>&1; then
      echo -e "${RED}FAIL${NC} $LIB_NAME exported from $ENTRY but missing from $MAPPING_FILE"
      ERRORS=$((ERRORS + 1))
    fi
  done <<< "$IMPORTED_SLUGS"
done

echo ""
if [[ $ERRORS -eq 0 ]]; then
  echo -e "${GREEN}All checks passed.${NC}"
  exit 0
else
  echo -e "${RED}${ERRORS} issue(s) found.${NC}"
  if [[ "$FIX" != true ]]; then
    echo "Run with --fix to auto-repair tsconfig includes."
  fi
  exit 1
fi
