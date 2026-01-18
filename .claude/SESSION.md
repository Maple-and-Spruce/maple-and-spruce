# Session Context

> **DIRECTIVE**: Keep this file updated after completing tasks, making decisions, or learning new context. This ensures continuity across sessions.

---

## Current Work

**Status**: Domain setup complete, functions working with CORS. Ready to start Artist Management (#2).

**Recent session** (2026-01-18): Set up custom domains on Vercel (mapleandsprucefolkarts.com), fixed Firebase Functions CORS issues by switching from `onCall` to `onRequest` with manual CORS middleware (Mountain SOL pattern), configured us-east4 region for Firebase SDK.

### Inventory (#3) - Known Issues to Fix

These issues exist in the merged code and need to be fixed when returning to #3:

1. **ProductForm status enum mismatch** - Form uses `'available' | 'reserved' | 'sold'` but domain type uses `'active' | 'draft' | 'discontinued'`
   - File: `apps/maple-spruce/src/components/inventory/ProductForm.tsx`

2. **ProductForm missing quantity field** - Domain type and validation require `quantity`, but form doesn't include it
   - File: `apps/maple-spruce/src/components/inventory/ProductForm.tsx`

3. **Manual artistId input** - Form has text field for `artistId` instead of dropdown
   - Blocked by: #2 Artist Management (need artists to populate dropdown)
   - File: `apps/maple-spruce/src/components/inventory/ProductForm.tsx`

4. **No artist info displayed** - ProductList doesn't show artist name
   - Blocked by: #2 Artist Management
   - File: `apps/maple-spruce/src/components/inventory/ProductList.tsx`

See [issue #3 comment](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/3#issuecomment-3762626561) for full details.

## Deployment

| Service | URL | Notes |
|---------|-----|-------|
| **Vercel** | mapleandsprucefolkarts.com | Web app + API proxy, auto-deploys on push to main |
| **Firebase Functions** | `us-east4` | Auto-deploys on merge to main via GitHub Actions |

### Domains

| Domain | Status | Target |
|--------|--------|--------|
| mapleandsprucefolkarts.com | ✅ Configured | Vercel (web app) |
| www.mapleandsprucefolkarts.com | ✅ Configured | Vercel (web app) |
| mapleandsprucewv.com | Owned (Namecheap) | Redirect to primary (future) |

### Architecture

- **Vercel** hosts the Next.js web app at `mapleandsprucefolkarts.com`
- **Firebase Functions** use `onRequest` (HTTP functions) with manual CORS middleware
- Frontend uses Firebase SDK `httpsCallable()` which calls functions directly at `us-east4-maple-and-spruce.cloudfunctions.net`
- CORS origins configured via `.env.prod` / `.env.dev` files (no localhost in production)

### Firebase Functions (us-east4)

All 10 functions are deployed to `us-east4` (Northern Virginia - close to WV business):
- Artist functions: `getArtists`, `getArtistById`, `createArtist`, `updateArtist`, `deleteArtist`
- Product functions: `getProducts`, `getProductById`, `createProduct`, `updateProduct`, `deleteProduct`

**Function Pattern** (following Mountain SOL):
- Use `onRequest` instead of `onCall` for full CORS control
- Manual CORS middleware validates origin against `ALLOWED_ORIGINS`
- Manual Firebase Auth token verification from `Authorization: Bearer <token>` header
- Response format: `{ data: result }` to match `httpsCallable` expectations

**Deployment**: Automatic on merge to main via `.github/workflows/firebase-functions-merge.yml`

## External Services Status

### Firebase
| Item | Status | Details |
|------|--------|---------|
| Project created | ✅ | `maple-and-spruce` |
| Web app registered | ✅ | `maple-and-spruce-inventory` |
| Firestore enabled | ✅ | Test mode |
| Authentication enabled | ✅ | Email/Password |
| CLI access | ✅ | `katie@mapleandsprucefolkarts.com` |
| App Hosting | ❌ | Using Vercel instead |
| Blaze Plan | ✅ | Billing enabled |
| Functions deployed | ✅ | 10 functions in `us-east4` |
| App Engine | ✅ | `us-east4` region |

### Etsy
| Item | Status | Details |
|------|--------|---------|
| Developer account | ✅ | Created |
| App registered | ⏳ | `maple-spruce-inventory` - Pending approval |
| Keystring | ✅ | `rhcrehdphw5y3qjkf4fmdttm` |
| Shared Secret | ✅ | (stored securely) |
| Test shop | ❌ | Not needed - using real shop |

**Note**: Etsy app approval typically takes 1-2 business days.

### Square
| Item | Status | Details |
|------|--------|---------|
| Developer account | ❌ | Need to create |
| App registered | ❌ | Need to register after account |
| API credentials | ❌ | Pending |

## Project Structure

```
libs/
├── ts/
│   ├── firebase/
│   │   ├── firebase-config/        # Client SDK singleton
│   │   └── api-types/              # API request/response types ✅
│   ├── domain/                     # Domain types ✅ (updated 2026-01-16)
│   └── validation/                 # Vest suites ✅
└── firebase/
    ├── database/                   # Admin SDK + repositories
    ├── functions/                  # Function utilities ✅
    └── maple-functions/            # Individual functions (to create)
```

**Path aliases:**
- `@maple/ts/firebase/firebase-config` → Client SDK
- `@maple/firebase/database` → Admin SDK
- `@maple/firebase/functions` → Function utilities
- `@maple/ts/domain` → Domain types (Artist, Product, Sale, Payout, InventoryMovement, SyncConflict)
- `@maple/ts/validation` → Vest validation suites
- `@maple/ts/firebase/api-types` → API request/response types

## CI/CD

| Workflow | Trigger | Action |
|----------|---------|--------|
| `build-check.yml` | PR to any branch | Build Next.js app + functions |
| `firebase-functions-merge.yml` | Merge to main | Deploy affected functions to `us-east4` |
| Vercel | Push to main | Deploy web app to production |

### GCP Setup for CI/CD (completed 2026-01-17)

The following GCP configuration was required for GitHub Actions to deploy functions:

**APIs enabled:**
- Cloud Run API
- Eventarc API
- Cloud Billing API

**Service account roles** (for `github-deployer`):
- Service Account User

**Cloud Build service account** (`maple-and-spruce@appspot.gserviceaccount.com`):
- Cloud Functions Developer (via Cloud Build settings page)
- Cloud Run Admin (via Cloud Build settings page)

**Compute service account** (`[project-number]-compute@developer.gserviceaccount.com`):
- Logs Writer
- Storage Object Viewer
- Artifact Registry Writer

## Architecture Decisions (2026-01-16)

### Inventory System Design

**Hybrid Square + Firestore architecture:**
- **Square owns**: Product catalog (name, price, images), inventory quantities, SKU
- **Firestore owns**: Artist profiles, product-artist relationships, commission rates, sales attribution, payouts, sync conflicts

**Key design choices:**
1. Products in Firestore are **linking records** - store `squareItemId`, `etsyListingId`, `artistId`, and cached display data
2. **Quantity-based model** - all products have quantity (even one-of-a-kind items)
3. **Immutable audit log** - `InventoryMovement` collection tracks all changes for reconciliation
4. **Manual conflict resolution** - `SyncConflict` collection surfaces issues for admin decision
5. **SKU format**: Opaque `prd_[random]` - no encoded semantics

**See ADRs 009-012 in docs/DECISIONS.md for full rationale.**

### Commission Model
- Artists have `defaultCommissionRate`
- Products can have `customCommissionRate` override
- Rate applied at sale time is snapshotted in Sale record

## Recent Decisions

1. **No separate test environment** - Single Firebase project, single Etsy app. Internal tool with low risk.
2. **Use real Etsy shop** - Only reading data, no risk of corruption.
3. **Use `libs/` not `packages/`** - Matches mountain-sol-platform patterns for consistency.
4. **`@maple/` namespace** - Path alias prefix for all shared libraries.
5. **Followed mountain-sol patterns** - Singleton Firebase app, admin SDK setup, CI/CD workflows.
6. **Vercel for hosting** - Firebase App Hosting requires billing; Vercel free tier works for now.
7. **Square as POS** - Industry standard, good API, native Etsy integration.
8. **Hybrid inventory architecture** - Square for catalog/quantity, Firestore for consignment logic.
9. **Event sourcing for inventory** - InventoryMovement audit log for reconciliation.
10. **Manual sync conflict resolution** - Surface issues in UI, don't auto-resolve.
11. **No local emulators for Firebase services** - Use production Firebase (Auth, Firestore, Storage) directly. Only run functions emulator locally. Firebase CLI login handles authentication.
12. **onRequest over onCall** - Use HTTP functions with manual CORS (Mountain SOL pattern) for full control over CORS headers and preflight handling.
13. **CORS origins in env files** - `.env.prod` for production domains, `.env.dev` for localhost. No localhost in production for security.

## Recent Changes

| Date | Change | PR |
|------|--------|-----|
| 2026-01-18 | Remove localhost from production CORS origins | #48 |
| 2026-01-18 | Switch to onRequest with manual CORS handling | #47 |
| 2026-01-18 | Allow public HTTP access to Cloud Functions v2 | #46 |
| 2026-01-18 | Configure Firebase Functions SDK to use us-east4 region | #45 |
| 2026-01-18 | Add Next.js API rewrites to proxy to Firebase Functions | #43 |
| 2026-01-17 | Add --force flag to deploy, redeploy getArtists to us-east4 | #38 |
| 2026-01-17 | Deploy functions to us-east4 region | #37 |
| 2026-01-17 | Verify CI/CD deploy with codebase filter | #36 |
| 2026-01-16 | Inventory foundation, auth infrastructure (partial #3) | #21 |
| 2026-01-16 | Inventory system architecture, domain type updates | #25 |

## Domain Types Updated (2026-01-16)

- **Artist** - Renamed `commissionRate` → `defaultCommissionRate`
- **Product** - Now a linking record with `squareItemId`, `squareVariationId`, `etsyListingId`, `quantity`, `sku`, `customCommissionRate`, sync metadata
- **Sale** - Added `quantitySold`, `commissionRateApplied`, `squareOrderId`, `squarePaymentId`
- **Payout** - Added `saleCount`, `paymentMethod`, `paymentReference`, `updatedAt`
- **InventoryMovement** - NEW: Immutable audit log for inventory changes
- **SyncConflict** - NEW: Track and resolve sync issues between systems

## Next Steps

1. **Implement issue #2** - Artist Management (CRUD, repository, functions, UI)
2. **Return to issue #3** - Fix ProductForm issues, add artist dropdown
3. **Wait for Etsy approval** - Then implement issue #4
4. **Create Square developer account** - Register app, get API credentials (Phase 2)
5. **Set up Firebase billing** - When ready, switch from Vercel to App Hosting

---

*Last updated: 2026-01-18*
