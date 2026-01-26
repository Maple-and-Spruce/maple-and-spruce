# Session Context

> **DIRECTIVE**: Keep this file updated with current work status. Archive completed sessions to `history/YYYY-MM-DD.md`.

---

## Current Status

**Date**: 2026-01-25
**Status**: ✅ Sync Conflict Resolution Complete

### Completed Today

- **Sync Conflict Resolution (#28) - COMPLETE:**
  - Closed GitHub issue #28 after PR #103 merged
  - Full implementation of sync conflict detection and resolution UI

- **Storybook Interaction Test Fixes:**
  - Fixed MUI Dialog tests using `screen` instead of `canvas` (portal rendering)
  - Fixed DataGrid tests using `getAllByRole` for multiple resolve buttons
  - Added ADR-019: Storybook Interaction Testing Patterns

- **Square Webhook Bug Fix:**
  - Fixed inventory sync - webhook was parsing payload incorrectly
  - Changed from `event.data.object.catalog_object_id` to `event.data.object.inventory_counts[0].catalog_object_id`

- **Cloud Function Unit Tests:**
  - Added tests for `detect-sync-conflicts` (13 tests)
  - Added tests for `square-webhook` (10 tests)
  - Added ADR-017: Cloud Function Unit Testing with Mocked Dependencies
  - Added ADR-018: Sync Conflict History Preservation

- **Documentation Updates:**
  - Updated AGENTS.md directive #9: Claude never deploys - user runs locally
  - Added testing patterns and conflict detection to Implementation Status

### Previous Session (2026-01-20)

- **Dev/Prod Webflow Sync Separation:**
  - Added `is-dev-environment` boolean field to Webflow CMS items ✅ (implemented in Webflow)
  - Dev items are marked `is-dev-environment: true`, prod items are `false`
  - Dev items stay as drafts, prod items auto-publish

- **Webflow CMS Sync - DEPLOYED & TESTED:**
  - `syncArtistToWebflow` function deployed and working
  - Artists syncing to Webflow CMS successfully

### Next Steps
1. Create initial categories (Pottery, Textiles, Jewelry, etc.)
2. Etsy Integration (#4) - waiting for app approval
3. Inventory Movement Audit Log (#27)

### Notes
- **No initial artist migration needed** - starting from scratch in Webflow
- `is-dev-environment` field already implemented in Webflow CMS

### Blockers
- Etsy app still pending approval

---

## Quick Reference

### Environments
| Environment | Web App | Firebase Project | Square |
|-------------|---------|------------------|--------|
| Production | business.mapleandsprucefolkarts.com | `maple-and-spruce` | Production API |
| Development | business-dev.mapleandsprucefolkarts.com | `maple-and-spruce-dev` | Sandbox API |

### Required Vercel Env Vars
| Project | `NEXT_PUBLIC_FIREBASE_ENV` |
|---------|---------------------------|
| Production | `prod` ✅ |
| Development | `dev` ✅ |

### Webflow IDs
| Item | ID |
|------|-----|
| Site ID | `691a5d6c07ba1bf4714e826f` |
| Artists Collection ID | `696f08a32a1eb691801f17ad` |

### Test Commands
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific library
npx nx run validation:test
npx nx run domain:test
npx nx run firebase-maple-functions-detect-sync-conflicts:test
npx nx run firebase-maple-functions-square-webhook:test
```

### Storybook Commands
```bash
# Run Storybook locally
npx nx run maple-spruce:storybook

# Build Storybook
npx nx run maple-spruce:build-storybook
```

### Local Development
```bash
# Run functions locally
npx nx run functions:serve

# Run web app locally
npx nx run maple-spruce:serve
```

### Deployment
**Let CI/CD handle deployments** - don't run manual `firebase deploy` commands.

Functions deploy automatically when PRs merge to main via `.github/workflows/firebase-functions-merge.yml`.

### Deployed Cloud Functions
- `syncArtistToWebflow` - Firestore trigger that syncs artist changes to Webflow CMS
- `getPublicArtists` - Public API for fetching active artists (no auth required)
- `getSyncConflicts` - List sync conflicts with filters
- `getSyncConflictSummary` - Get counts for nav badge
- `resolveSyncConflict` - Apply resolution
- `detectSyncConflicts` - Compare Firestore vs Square data
- `squareWebhook` - Handles Square inventory updates

### Square Webhook URLs (register in Square Dashboard)
| Environment | URL |
|-------------|-----|
| Production | `https://us-east4-maple-and-spruce.cloudfunctions.net/squareWebhook` |
| Development | `https://us-east4-maple-and-spruce-dev.cloudfunctions.net/squareWebhook` |

---

## Session History

See `history/` folder for detailed session logs:
- [2026-01-25](history/2026-01-25.md) - Sync conflict resolution, Storybook test fixes
- [2026-01-20](history/2026-01-20.md) - Webflow CMS sync, dev/prod separation
- [2026-01-19](history/2026-01-19.md) - Dev environment fixes, product/artist integration
- [2026-01-18](history/2026-01-18.md) - Square integration foundation, dev/prod separation

---

*Last updated: 2026-01-25*
