# Session Context

> **DIRECTIVE**: Keep this file updated after completing tasks, making decisions, or learning new context. This ensures continuity across sessions.

---

## Current Work

**Status**: ✅ **DEV ENVIRONMENT FULLY OPERATIONAL**

**Latest session** (2026-01-19):
- Fixed dev site (business-dev.mapleandsprucefolkarts.com):
  - PR #76: Use `NEXT_PUBLIC_FIREBASE_ENV` for Firebase config detection (fixed `auth/invalid-api-key`)
  - PR #77: Add dev site to CORS allowed origins
  - Configured Square sandbox secrets in `maple-and-spruce-dev` Firebase project
  - Registered Square sandbox webhook with correct URL format
- Dev environment now fully working: auth, artists, products, Square integration

**Previous session** (2026-01-19):
- Completed Product ↔ Artist integration (#3):
  - Replaced manual Artist ID text input with dropdown selector
  - Added artist name display on product cards ("by Artist Name")
  - PR #75 merged
- Fixed CI/CD Secret Manager permissions

### Next Steps

1. **Set `NEXT_PUBLIC_FIREBASE_ENV=prod`** in production Vercel project (if not done)
2. **Etsy Integration (#4)** - waiting for app approval

---

## Environments

### Production
| Component | URL/Project | Notes |
|-----------|-------------|-------|
| Firebase Project | `maple-and-spruce` | Production data |
| Vercel App | business.mapleandsprucefolkarts.com | Auto-deploys on push to main |
| Vercel Env Var | `NEXT_PUBLIC_FIREBASE_ENV=prod` | **Needs to be set** |
| Square | Production API | Real inventory |
| Square Webhook | `https://us-east4-maple-and-spruce.cloudfunctions.net/squareWebhook` | Must match exactly |
| Functions | 13 deployed to `us-east4` | |

### Development
| Component | URL/Project | Notes |
|-----------|-------------|-------|
| Firebase Project | `maple-and-spruce-dev` | Sandbox data |
| Vercel App | business-dev.mapleandsprucefolkarts.com | Separate Vercel project |
| Vercel Env Var | `NEXT_PUBLIC_FIREBASE_ENV=dev` | ✅ Set |
| Square | Sandbox API | Test inventory |
| Square Webhook | `https://us-east4-maple-and-spruce-dev.cloudfunctions.net/squareWebhook` | ✅ Registered |
| Functions | 13 deployed to `us-east4` | |

### Environment Detection

The web app selects Firebase config based on:
1. **`NEXT_PUBLIC_FIREBASE_ENV`** env var (checked first - set in Vercel)
2. **Hostname fallback** for local dev (`localhost`, `127.0.0.1`, `*-dev.*`)

### Secrets (per-project, same names in Firebase Secret Manager)

| Secret | Dev Value | Prod Value |
|--------|-----------|------------|
| `SQUARE_ACCESS_TOKEN` | Sandbox token | Production token |
| `SQUARE_WEBHOOK_SIGNATURE_KEY` | Sandbox webhook key | Production webhook key |

### String Parameters (.env files)

| Param | Dev (.env.dev) | Prod (.env.prod) |
|-------|----------------|------------------|
| `SQUARE_ENV` | `LOCAL` | `PROD` |
| `SQUARE_LOCATION_ID` | `LW0MMBZ5721QY` | `LEJBNPRGM99NV` |
| `ALLOWED_ORIGINS` | localhost + business-dev.* | business.* domains |

---

## Deployment

| Service | URL | Notes |
|---------|-----|-------|
| **Vercel (Prod)** | business.mapleandsprucefolkarts.com | Admin web app |
| **Vercel (Dev)** | business-dev.mapleandsprucefolkarts.com | Dev admin app |
| **Firebase Hosting** | maple-and-spruce-api.web.app | API proxy (prod) |
| **Webflow** | mapleandsprucefolkarts.com | Customer-facing site |

### Square Webhook URLs

**IMPORTANT**: Webhook signature verification requires the URL to match exactly what's registered in Square Dashboard.

| Environment | Webhook URL (register this in Square) |
|-------------|---------------------------------------|
| Production | `https://us-east4-maple-and-spruce.cloudfunctions.net/squareWebhook` |
| Development | `https://us-east4-maple-and-spruce-dev.cloudfunctions.net/squareWebhook` |

**Note**: Do NOT use the Cloud Run URLs (`https://squarewebhook-xxx-uk.a.run.app`) - use the `cloudfunctions.net` format above.

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
| Square Secrets | ✅ | ✅ |

### Vercel
| Item | Prod | Dev |
|------|------|-----|
| App | ✅ | ✅ |
| `NEXT_PUBLIC_FIREBASE_ENV` | ⚠️ Needs `prod` | ✅ `dev` |

### Square
| Item | Status | Details |
|------|--------|---------|
| Developer account | ✅ | Created |
| Sandbox app | ✅ | Configured in dev project |
| Production app | ✅ | Configured in prod project |
| Dev Webhook | ✅ | Signature verification working |
| Prod Webhook | ✅ | Signature verification working |

### Etsy
| Item | Status | Details |
|------|--------|---------|
| Developer account | ✅ | Created |
| App registered | ⏳ | Pending approval |

---

## Recent Changes

| Date | Change | PR |
|------|--------|-----|
| 2026-01-19 | Add dev site to CORS allowed origins | #77 |
| 2026-01-19 | Use NEXT_PUBLIC_FIREBASE_ENV for config detection | #76 |
| 2026-01-19 | Product/artist integration (dropdown + display) | #75 |
| 2026-01-18 | Simplify secrets to per-project pattern | #71 |

## Recent Decisions

16. **Separate dev/prod Firebase projects** - Each project has its own secrets with the same names.
17. **Environment variable for Firebase config** - Use `NEXT_PUBLIC_FIREBASE_ENV` (set in Vercel) instead of hostname detection for deployed apps.
18. **Per-project Square webhooks** - Each project registers its own webhook URL with Square using `cloudfunctions.net` format.
19. **Pass artists to ProductForm from parent** - Inventory page loads artists once and passes to children.

---

## Known Issues

1. **Prod Vercel needs env var** - Set `NEXT_PUBLIC_FIREBASE_ENV=prod` if not already done
2. **Vercel rate limiting** - Occasional rate limits on deploys; wait and retry

---

## What's Working Now

| Component | Status | Notes |
|-----------|--------|-------|
| **Prod Web App** | ✅ Live | business.mapleandsprucefolkarts.com |
| **Dev Web App** | ✅ Live | business-dev.mapleandsprucefolkarts.com |
| **Firebase Auth** | ✅ | Both projects |
| **Cloud Functions** | ✅ | 13 functions, both projects |
| **Square Integration** | ✅ | Catalog, inventory, webhooks (both envs) |
| **Artist Management** | ✅ | Full CRUD with image upload |
| **Product Management** | ✅ | CRUD with artist dropdown, Square sync |
| **CI/CD** | ✅ | Push to main → deploy to prod |
| **Local Dev** | ✅ | `nx run functions:serve` |

---

*Last updated: 2026-01-19*
