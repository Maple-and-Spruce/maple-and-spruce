# Session Context

> **DIRECTIVE**: Keep this file updated with current work status. Archive completed sessions to `history/YYYY-MM-DD.md`.

---

## Current Status

**Date**: 2026-01-20
**Status**: ⚠️ Webflow sync needs IAM permissions

### Blocker: IAM Permissions for Firestore Trigger

The `syncArtistToWebflow` function is a Firestore trigger (event-driven), which requires additional IAM permissions not needed by HTTP functions. The deployment is failing with:

```
Error: We failed to modify the IAM policy for the project.
```

**Run these commands to fix (requires project owner):**
```bash
gcloud projects add-iam-policy-binding maple-and-spruce-dev \
  --member=serviceAccount:service-1062803455357@gcp-sa-pubsub.iam.gserviceaccount.com \
  --role=roles/iam.serviceAccountTokenCreator

gcloud projects add-iam-policy-binding maple-and-spruce-dev \
  --member=serviceAccount:1062803455357-compute@developer.gserviceaccount.com \
  --role=roles/run.invoker

gcloud projects add-iam-policy-binding maple-and-spruce-dev \
  --member=serviceAccount:1062803455357-compute@developer.gserviceaccount.com \
  --role=roles/eventarc.eventReceiver
```

After running these, re-trigger the CI by pushing an empty commit or re-running the workflow.

### Completed Today
- **Webflow CMS Sync Implementation:**
  - Installed `webflow-api` SDK
  - Created `libs/firebase/webflow/` library with:
    - `Webflow` utility class (follows Square pattern)
    - `ArtistService` for syncing artists to Webflow CMS
    - Exports: `WEBFLOW_SECRET_NAMES`, `WEBFLOW_STRING_NAMES`
  - Created `syncArtistToWebflow` Firestore trigger function:
    - Triggers on `artists/{artistId}` document writes
    - Creates/updates/deletes Webflow CMS items based on artist status
    - Only syncs `active` artists to Webflow
    - Stores `webflowItemId` back in Firestore for reference
  - Added `webflowItemId` field to `Artist` domain type
  - Added `updateWebflowItemId()` to `ArtistRepository`
  - Added Webflow config to `.env.dev` and `.env.prod`
  - Fixed `nx.json` - removed `^build` dependency from esbuild

- **CI/CD Fixes:**
  - Fixed invalid package names in library package.json files (had slashes)
  - Removed unnecessary package.json files from libs (not needed, esbuild bundles from source)
  - Fixed project.json naming for sync-artist-to-webflow (must be `firebase-maple-functions-*`)

- **Documentation:**
  - Added directive #9: Let CI/CD handle deployments
  - Added directive #10: No package.json in libraries
  - Added directive #11: Function library naming convention
  - Added "Creating a New Cloud Function" guide in AGENTS.md

### Previous Session
- Closed #26 (Square Integration Setup) - was already complete
- Storybook deployed to Chromatic
- **Public Artist API (Phase 2a):**
  - Created `PublicArtist` type in domain library (strips sensitive fields)
  - Created `toPublicArtist()` helper function
  - Added `GetPublicArtistsRequest/Response` API types
  - Created `getPublicArtists` Cloud Function (no auth required)
  - Added Firestore composite index for `status + name` query
  - Updated CORS to allow Webflow domains
- **Webflow Integration Strategy (ADR-016):**
  - Decided on CMS Collection Sync approach (vs embedded components)
  - Researched Webflow CMS API authentication, SDK, rate limits, image handling

### Next Steps
1. **Fix IAM permissions** (see blocker above)
2. **Test Webflow sync:**
   - Edit an active artist in admin UI
   - Check Webflow CMS for new item
3. **Initial artist migration:**
   - Run one-time sync of existing active artists
   - Verify data integrity in Webflow
4. Create initial categories (Pottery, Textiles, Jewelry, etc.)
5. Etsy Integration (#4) - waiting for app approval

### Blockers
- **IAM permissions for Firestore trigger** - needs gcloud commands run by project owner
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
```

### Storybook Commands
```bash
# Run Storybook locally
npx nx run maple-spruce:storybook

# Build Storybook
npx nx run maple-spruce:build-storybook
```

### Deployment
**Let CI/CD handle deployments** - don't run manual `firebase deploy` commands.

Functions deploy automatically when PRs merge to main via `.github/workflows/firebase-functions-merge.yml`.

```bash
# To deploy: just merge your PR to main
# CI/CD will build and deploy automatically
```

### New Webflow Function
- `syncArtistToWebflow` - Firestore trigger that syncs artist changes to Webflow CMS

### Square Webhook URLs (register in Square Dashboard)
| Environment | URL |
|-------------|-----|
| Production | `https://us-east4-maple-and-spruce.cloudfunctions.net/squareWebhook` |
| Development | `https://us-east4-maple-and-spruce-dev.cloudfunctions.net/squareWebhook` |

---

## Session History

See `history/` folder for detailed session logs:
- [2026-01-19](history/2026-01-19.md) - Dev environment fixes, product/artist integration
- [2026-01-18](history/2026-01-18.md) - Square integration foundation, dev/prod separation

---

*Last updated: 2026-01-20*
