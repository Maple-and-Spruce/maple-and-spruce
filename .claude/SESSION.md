# Session Context

> **DIRECTIVE**: Keep this file updated after completing tasks, making decisions, or learning new context. This ensures continuity across sessions.

---

## Current Work

**Status**: ✅ **PRODUCTION READY** - CI/CD pipeline working, functions deployed, Firestore accessible. Ready to build features.

**Milestone achieved** (2026-01-18):
- 🎉 Full CI/CD pipeline working: push to main → automatic function deployment
- 🎉 Production web app live at mapleandsprucefolkarts.com
- 🎉 Firebase Functions responding correctly with Firestore data
- 🎉 Authentication flow working (Firebase Auth → Functions → Firestore)

**Recent session** (2026-01-18):
- Set up custom domains on Vercel (mapleandsprucefolkarts.com)
- Fixed Firebase Functions CORS by switching to `onRequest` with manual CORS middleware
- Configured Firebase Hosting as API proxy (matching Mountain SOL pattern)
- Fixed org policy to allow public Cloud Run access (`iam.allowedPolicyMemberDomains` reset)
- Fixed Firebase Admin initialization in `auth.utility.ts` (PR #58)
- **Critical fix**: Granted `roles/datastore.user` to compute service account for Firestore access
- All 12 functions deployed and working in production

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
| **Vercel** | mapleandsprucefolkarts.com | Web app, auto-deploys on push to main |
| **Firebase Hosting** | maple-and-spruce-api.web.app | API proxy to Cloud Functions |
| **Firebase Functions** | `us-east4` | Auto-deploys on merge to main via GitHub Actions |

### Domains

| Domain | Status | Target |
|--------|--------|--------|
| mapleandsprucefolkarts.com | ✅ Configured | Vercel (web app) |
| www.mapleandsprucefolkarts.com | ✅ Configured | Vercel (web app) |
| maple-and-spruce-api.web.app | ✅ Active | Firebase Hosting (API proxy) |
| mapleandsprucewv.com | Owned (Namecheap) | Redirect to primary (future) |

### Architecture

- **Vercel** hosts the Next.js web app at `mapleandsprucefolkarts.com`
- **Firebase Hosting** proxies API requests at `maple-and-spruce-api.web.app`
- **Firebase Functions** use `onRequest` (HTTP functions) with manual CORS middleware and `invoker: 'public'`
- API calls go through Firebase Hosting rewrites (e.g., `/getArtists` → `getArtists` function)
- CORS origins configured via `.env.prod` / `.env.dev` files (no localhost in production)

### Firebase Functions (us-east4)

All 12 functions are deployed to `us-east4` (Northern Virginia - close to WV business):
- Artist functions: `getArtists`, `getArtist`, `createArtist`, `updateArtist`, `deleteArtist`, `uploadArtistImage`
- Product functions: `getProducts`, `getProduct`, `createProduct`, `updateProduct`, `deleteProduct`
- Health check: `healthCheck`

**Function Pattern** (following Mountain SOL):
- Use `onRequest` with `invoker: 'public'` for public HTTP access
- Manual CORS middleware validates origin against `ALLOWED_ORIGINS`
- Manual Firebase Auth token verification from `Authorization: Bearer <token>` header
- Response format: `{ data: result }` to match `httpsCallable` expectations

**Deployment**: Automatic on merge to main via `.github/workflows/firebase-functions-merge.yml`

### API Access

API endpoints are available at:
- `https://maple-and-spruce-api.web.app/getArtists`
- `https://maple-and-spruce-api.web.app/createProduct`
- etc.

## External Services Status

### Firebase
| Item | Status | Details |
|------|--------|---------|
| Project created | ✅ | `maple-and-spruce` |
| Web app registered | ✅ | `maple-and-spruce-inventory` |
| Firestore enabled | ✅ | Test mode |
| Authentication enabled | ✅ | Email/Password |
| CLI access | ✅ | `katie@mapleandsprucefolkarts.com` |
| Hosting (API proxy) | ✅ | `maple-and-spruce-api` site with rewrites |
| Blaze Plan | ✅ | Billing enabled |
| Functions deployed | ✅ | 12 functions in `us-east4` |
| App Engine | ✅ | `us-east4` region |

### GCP Organization Policy (Fixed 2026-01-18)

The Google Workspace org policy `iam.allowedPolicyMemberDomains` was preventing `allUsers` from being set as Cloud Run invokers. This was fixed by:
1. Granting `roles/orgpolicy.policyAdmin` on the organization
2. Resetting the policy at the project level: `spec.reset: true`

Now new functions can use `invoker: 'public'` and will be automatically publicly accessible.

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
    └── maple-functions/            # Individual functions (10 deployed)
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
- Organization Policy API

**Service account roles** (for `github-deployer`):
- Service Account User
- Firebase Admin
- Cloud Functions Developer
- Cloud Run Admin

**Cloud Build service account** (`maple-and-spruce@appspot.gserviceaccount.com`):
- Cloud Functions Developer (via Cloud Build settings page)
- Cloud Run Admin (via Cloud Build settings page)

**Compute service account** (`138840458966-compute@developer.gserviceaccount.com`):
- Logs Writer
- Storage Object Viewer
- Artifact Registry Writer
- **Datastore User** - Required for Firestore access from Cloud Functions
- **Storage Object Admin** - Required for image uploads to Cloud Storage

## Mountain SOL Pattern Comparison (2026-01-18)

Maple & Spruce was compared to [Mountain SOL Platform](https://github.com/MountainSOLSchool/platform) to ensure alignment with proven patterns.

### Where We Match ✅
- **Firebase Admin initialization** - Same `if (admin.apps.length === 0) { admin.initializeApp(); }` pattern
- **Database config** - Same `preferRest: true` setting for Firestore
- **Repository pattern** - All Firestore access through repository modules
- **Role-based auth** - Admins collection with UID-based document lookup
- **Function structure** - HTTP functions with CORS and auth verification

### Where We're Ahead 🚀
- **Workload Identity Federation** - Mountain SOL uses service account keys in GitHub secrets; we use keyless auth (more secure)
- **Simpler function pattern** - Factory functions vs fluent builder (appropriate for project scale)
- **Better error responses** - JSON formatted errors with consistent structure
- **Environment configuration** - `.env.prod`/`.env.dev` copied during build for runtime configuration

### Key Infrastructure Learnings

1. **Compute service account needs Firestore access** - The default compute service account (`[project-number]-compute@developer.gserviceaccount.com`) doesn't have Firestore permissions by default. Must grant `roles/datastore.user`.

2. **Firebase Admin must be initialized before getFirestore()** - If `auth.utility.ts` is imported before `database.config.ts`, you need defensive initialization in both places.

3. **Org policy can block public Cloud Run** - Google Workspace organizations may have `iam.allowedPolicyMemberDomains` policy that prevents `allUsers` access. Reset at project level: `spec.reset: true`.

4. **Workload Identity Federation setup** - Create identity pool, provider, grant IAM permissions. No secrets needed in GitHub.

5. **Firebase Hosting as API proxy** - Use rewrites to route `/functionName` to the actual function. Simpler than managing CORS for direct function URLs.

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
12. **onRequest with invoker: 'public'** - Use HTTP functions with manual CORS (Mountain SOL pattern) and public Cloud Run access.
13. **CORS origins in env files** - `.env.prod` for production domains, `.env.dev` for localhost. No localhost in production for security.
14. **Firebase Hosting for API proxy** - Use hosting rewrites to proxy API calls to functions (same pattern as Mountain SOL).
15. **Org policy override at project level** - Reset `iam.allowedPolicyMemberDomains` to allow `allUsers` for public API access.

## Recent Changes

| Date | Change | PR |
|------|--------|-----|
| 2026-01-18 | Ensure Firebase Admin initialized in auth.utility.ts | #58 |
| 2026-01-18 | Restore invoker: 'public' for automatic function access | #57 |
| 2026-01-18 | Fix function names in Firebase Hosting rewrites | #56 |
| 2026-01-18 | Use Firebase Hosting as API proxy instead of public invoker | #55 |
| 2026-01-18 | Add invoker: 'public' to functions (org policy fix needed) | #54 |
| 2026-01-18 | Trigger function redeploy with CORS fixes | #53 |
| 2026-01-18 | Include hidden files (.env) in artifact upload | #52 |
| 2026-01-18 | Add env files to Nx affected calculation | #51 |
| 2026-01-18 | Remove localhost from production CORS origins | #48 |
| 2026-01-18 | Switch to onRequest with manual CORS handling | #47 |

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

---

## What's Working Now

| Component | Status | Notes |
|-----------|--------|-------|
| **Web App** | ✅ Live | mapleandsprucefolkarts.com (Vercel) |
| **Firebase Auth** | ✅ Working | Email/password login |
| **Cloud Functions** | ✅ Deployed | 12 functions in us-east4 |
| **Firestore** | ✅ Accessible | Admin SDK working from functions |
| **CI/CD** | ✅ Automatic | Push to main → deploy functions |
| **API Proxy** | ✅ Configured | Firebase Hosting rewrites |
| **CORS** | ✅ Working | Production domains whitelisted |

**This is a solid foundation for building meaningful features.**

---

*Last updated: 2026-01-18*
