# Session Context

> **DIRECTIVE**: Keep this file updated after completing tasks, making decisions, or learning new context. This ensures continuity across sessions.

---

## Current Work

**Status**: ✅ **DEV/PROD ENVIRONMENTS COMPLETE** - Separate Firebase projects, clean secrets, both environments deployed.

**Milestone achieved** (2026-01-18):
- 🎉 Separate dev/prod Firebase projects with clean per-project secrets
- 🎉 Dev Vercel app deployed with hostname-based environment detection
- 🎉 All 13 functions deployed to both projects
- 🎉 Square integration foundation complete (catalog, inventory, webhooks)

**Latest session** (2026-01-18):
- Simplified secrets to per-project pattern (#71):
  - Removed `_PROD` suffix convention - each project uses same secret names
  - Dev project: `SQUARE_ACCESS_TOKEN` = sandbox, `SQUARE_WEBHOOK_SIGNATURE_KEY` = sandbox
  - Prod project: `SQUARE_ACCESS_TOKEN` = production, `SQUARE_WEBHOOK_SIGNATURE_KEY` = production
  - Cleaned up 8 unused secrets across both projects
- Set up dev environment:
  - Created `maple-and-spruce-dev` Firebase project with all permissions
  - Reset org policy (`iam.allowedPolicyMemberDomains`) on dev project
  - Deployed all 13 functions to dev
  - Created Vercel dev app
- Added hostname-based environment detection:
  - `localhost` or `business-dev.*` hostnames → dev Firebase project
  - Everything else → prod Firebase project

**Previous session** (2026-01-18):
- Completed Square webhook integration (#69/#70):
  - Created `squareWebhook` function for catalog and inventory events
  - HMAC-SHA256 signature verification
  - Batch catalog sync discovers new items from Square Dashboard
- Product CRUD wired to Square (create/update)

### Next Steps

1. **Test dev environment end-to-end**
   - Verify UI on dev hostname hits dev functions
   - Test product creation flows against Square sandbox

2. **Complete Product Management (#3)**
   - Fix ProductForm status enum mismatch
   - Add artist dropdown (after #2)
   - Display artist name in ProductList

3. **Artist Management (#2)**
   - UI already deployed, functions working
   - Test and polish

4. **Etsy Integration (#4)** - waiting for app approval

---

## Environments

### Production
| Component | URL/Project | Notes |
|-----------|-------------|-------|
| Firebase Project | `maple-and-spruce` | Production data |
| Vercel App | business.mapleandsprucefolkarts.com | Auto-deploys on push to main |
| Square | Production API | Real inventory |
| Functions | 13 deployed to `us-east4` | |

### Development
| Component | URL/Project | Notes |
|-----------|-------------|-------|
| Firebase Project | `maple-and-spruce-dev` | Sandbox data |
| Vercel App | (your dev URL) | Separate Vercel project |
| Square | Sandbox API | Test inventory |
| Functions | 13 deployed to `us-east4` | |

### Environment Detection

The web app automatically selects the correct Firebase project based on hostname:
1. `localhost` / `127.0.0.1` → dev project
2. Hostname contains `-dev.` or `.dev.` → dev project
3. Everything else → prod project

**No `.env.local` needed** - Firebase client config is hardcoded.

### Secrets (per-project, same names)

| Secret | Dev Value | Prod Value |
|--------|-----------|------------|
| `SQUARE_ACCESS_TOKEN` | Sandbox token | Production token |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Sandbox webhook key | Production webhook key |

### String Parameters (.env files)

| Param | Dev (.env.dev) | Prod (.env.prod) |
|-------|----------------|------------------|
| `SQUARE_ENV` | `LOCAL` | `PROD` |
| `SQUARE_LOCATION_ID` | Sandbox location | Production location |
| `ALLOWED_ORIGINS` | localhost | Production domains |

---

## Deployment

| Service | URL | Notes |
|---------|-----|-------|
| **Vercel (Prod)** | business.mapleandsprucefolkarts.com | Admin web app |
| **Vercel (Dev)** | (your dev URL) | Dev admin app |
| **Firebase Hosting** | maple-and-spruce-api.web.app | API proxy (prod) |
| **Webflow** | mapleandsprucefolkarts.com | Customer-facing site |

### Domains

| Domain | Target | Purpose |
|--------|--------|---------|
| mapleandsprucefolkarts.com | Webflow | Customer site |
| business.mapleandsprucefolkarts.com | Vercel (prod) | Admin app |
| business-dev.mapleandsprucefolkarts.com | Vercel (dev) | Dev admin app |

### Firebase Functions (13 total, both projects)

- Artist: `getArtists`, `getArtist`, `createArtist`, `updateArtist`, `deleteArtist`, `uploadArtistImage`
- Product: `getProducts`, `getProduct`, `createProduct`, `updateProduct`, `deleteProduct`
- Square: `squareWebhook`
- Health: `healthCheck`

---

## External Services Status

### Firebase
| Item | Prod | Dev |
|------|------|-----|
| Project | `maple-and-spruce` | `maple-and-spruce-dev` |
| Functions | ✅ 13 deployed | ✅ 13 deployed |
| Firestore | ✅ | ✅ |
| Auth | ✅ | ✅ |
| Org policy reset | ✅ | ✅ |

### Square
| Item | Status | Details |
|------|--------|---------|
| Developer account | ✅ | Created |
| Sandbox app | ✅ | Configured in dev project |
| Production app | ✅ | Configured in prod project |
| Webhooks | ✅ | Signature verification working |
| Library | ✅ | `libs/firebase/square/` |

### Etsy
| Item | Status | Details |
|------|--------|---------|
| Developer account | ✅ | Created |
| App registered | ⏳ | Pending approval |

---

## Recent Changes

| Date | Change | PR |
|------|--------|-----|
| 2026-01-18 | Simplify secrets to per-project pattern | #71 |
| 2026-01-18 | Square integration foundation | #70 |
| 2026-01-18 | Add responsive navigation menu | #67 |

## Recent Decisions

16. **Separate dev/prod Firebase projects** - Each project has its own secrets with the same names. Eliminates `_PROD` suffix complexity.
17. **Hostname-based environment detection** - `business-dev.*` automatically uses dev Firebase project.
18. **Per-project Square webhooks** - Each project registers its own webhook URL with Square.

---

## Known Issues (Product Form #3)

1. **Status enum mismatch** - Form uses old values, domain type uses `'active' | 'draft' | 'discontinued'`
2. **Missing quantity field** - Need to add to form
3. **Manual artistId input** - Need dropdown after #2 complete
4. **No artist info displayed** - ProductList needs artist name

---

## What's Working Now

| Component | Status | Notes |
|-----------|--------|-------|
| **Prod Web App** | ✅ Live | business.mapleandsprucefolkarts.com |
| **Dev Web App** | ✅ Live | (your dev URL) |
| **Firebase Auth** | ✅ | Both projects |
| **Cloud Functions** | ✅ | 13 functions, both projects |
| **Square Integration** | ✅ | Catalog, inventory, webhooks |
| **CI/CD** | ✅ | Push to main → deploy to prod |
| **Local Dev** | ✅ | `nx run functions:serve` |

---

*Last updated: 2026-01-18*
