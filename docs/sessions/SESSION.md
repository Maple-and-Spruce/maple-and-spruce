# Session Context

> **DIRECTIVE**: Keep this file updated with current work status. Archive completed sessions to `history/YYYY-MM-DD.md`.

---

## Current Status

**Date**: 2026-01-20
**Status**: ✅ Webflow sync function ready for deployment

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
  - Added Webflow config to `.env.dev` and `.env.prod`:
    - `WEBFLOW_SITE_ID=691a5d6c07ba1bf4714e826f`
    - `WEBFLOW_ARTISTS_COLLECTION_ID=696f08a32a1eb691801f17ad`
  - Fixed `nx.json` - removed `^build` dependency from esbuild (was causing unnecessary tsc builds)

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
1. **Deploy Webflow sync:**
   - Verify `WEBFLOW_API_TOKEN` secret is set in Firebase dev project
   - Deploy functions to dev: `firebase deploy --only functions --project=maple-and-spruce-dev`
   - Test sync by editing an active artist in admin UI
   - Check Webflow CMS for new item
2. **Initial artist migration:**
   - Run one-time sync of existing active artists
   - Verify data integrity in Webflow
3. Create initial categories (Pottery, Textiles, Jewelry, etc.)
4. Etsy Integration (#4) - waiting for app approval

### Blockers
- Etsy app still pending approval
- Need to re-authenticate Firebase CLI before deploying

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

### Deploy Commands
```bash
# Deploy functions to dev
npx nx run functions:build && firebase deploy --only functions --project=maple-and-spruce-dev

# Deploy functions to prod
npx nx run functions:build && firebase deploy --only functions --project=maple-and-spruce
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
