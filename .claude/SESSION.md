# Session Context

> **DIRECTIVE**: Keep this file updated after completing tasks, making decisions, or learning new context. This ensures continuity across sessions.

---

## Current Work

**Status**: Inventory CRUD with authentication complete. Basic admin app functional.

**Recent session** (2026-01-13): Implemented full inventory CRUD system with Firebase Functions, authentication flow, and admin role-based authorization.

## Deployment

| Service | URL | Notes |
|---------|-----|-------|
| **Vercel** | (check Vercel dashboard) | Auto-deploys on push to main |

**Why Vercel instead of Firebase App Hosting?**
Firebase App Hosting requires a billing account (Blaze plan). Using Vercel free tier until business checking account is set up. The `apphosting.yaml` is ready for when we switch.

## External Services Status

### Firebase
| Item | Status | Details |
|------|--------|---------|
| Project created | ✅ | `maple-and-spruce` |
| Web app registered | ✅ | `maple-and-spruce-inventory` |
| Firestore enabled | ✅ | Test mode |
| Authentication enabled | ✅ | Email/Password |
| CLI access | ✅ | `katie@mapleandsprucefolkarts.com` |
| App Hosting | ❌ | Requires billing - using Vercel for now |

### Etsy
| Item | Status | Details |
|------|--------|---------|
| Developer account | ✅ | Created |
| App registered | ⏳ | `maple-spruce-inventory` - Pending approval |
| Keystring | ✅ | `rhcrehdphw5y3qjkf4fmdttm` |
| Shared Secret | ✅ | (stored securely) |
| Test shop | ❌ | Not needed - using real shop |

**Note**: Etsy app approval typically takes 1-2 business days.

## Project Structure

```
libs/
├── ts/
│   ├── firebase/
│   │   ├── firebase-config/        # Client SDK singleton
│   │   └── api-types/              # API request/response types ✅
│   ├── domain/                     # Domain types ✅
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
- `@maple/ts/domain` → Domain types (Artist, Product, Sale, Payout)
- `@maple/ts/validation` → Vest validation suites
- `@maple/ts/firebase/api-types` → API request/response types

## CI/CD

| Workflow | Trigger | Action |
|----------|---------|--------|
| `build-check.yml` | PR to any branch | Build Next.js app |
| Vercel | Push to main | Deploy to production |

## Decisions Made

1. **No separate test environment** - Single Firebase project, single Etsy app. Internal tool with low risk.
2. **Use real Etsy shop** - Only reading data, no risk of corruption.
3. **Use `libs/` not `packages/`** - Matches mountain-sol-platform patterns for consistency.
4. **`@maple/` namespace** - Path alias prefix for all shared libraries.
5. **Followed mountain-sol patterns** - Singleton Firebase app, admin SDK setup, CI/CD workflows.
6. **Vercel for hosting** - Firebase App Hosting requires billing; Vercel free tier works for now.

## Recent Changes

| Date | Change | PR |
|------|--------|-----|
| 2026-01-13 | Firebase Functions, auth, admin authorization | #21 |
| 2026-01-11 | Infrastructure libraries (domain, validation, functions, api-types) | #20 |
| 2026-01-11 | SOL patterns documentation, issue updates, package.json deps | #19 |
| 2026-01-10 | App Hosting setup + Vercel deployment | #15 |
| 2026-01-10 | Reference repository documentation | #14 |
| 2026-01-10 | Firebase infrastructure setup (issue #7) | #13 |
| 2026-01-06 | Documentation improvements | #12 |

## Infrastructure Libraries Created (2026-01-11)

- **libs/ts/domain/** - Domain types (Artist, Product, Sale, Payout, RequestState)
- **libs/ts/validation/** - Vest validation suites for all domain types
- **libs/firebase/functions/** - createFunction, createAdminFunction, auth utilities, error helpers
- **libs/ts/firebase/api-types/** - Type-safe API request/response types for all endpoints

## Session 2026-01-13: Inventory CRUD + Auth Implementation

### What was built

1. **Firebase Functions App** (`apps/functions/`)
   - Entry point exporting all Cloud Functions
   - esbuild configuration for bundling
   - Local development with `firebase serve --only functions` (not emulators)
   - Functions connect to real Firebase (auth + Firestore)

2. **Product CRUD Functions** (`libs/firebase/maple-functions/product/`)
   - `getProducts` - List products (authenticated)
   - `getProduct` - Get single product (authenticated)
   - `createProduct` - Create product (admin only)
   - `updateProduct` - Update product (admin only)
   - `deleteProduct` - Delete product (admin only)

3. **Product Repository** (`libs/firebase/database/src/lib/product.repository.ts`)
   - Firestore CRUD operations
   - Filtering by artistId, status
   - `markAsSold` helper

4. **Authentication System**
   - `AuthGuard` component - Protects routes, redirects to login
   - `useAuth` hook - Firebase auth state, sign out
   - `UserMenu` component - Account dropdown with logout
   - Login page with sign in/sign up/password reset

5. **Admin Role Authorization**
   - Roles stored in `admins` Firestore collection
   - Document ID = user UID
   - `hasRole()` utility checks admin status

6. **MUI Theme** (`apps/maple-spruce/src/lib/theme/`)
   - Brand colors (sage green, dark brown, cream)
   - Custom component styling

7. **Inventory Page** (`apps/maple-spruce/src/app/inventory/`)
   - Product list with cards
   - Add/edit dialog
   - Delete confirmation
   - Connected to Firebase Functions

### Key learnings

1. **Next.js + Nx workspace module resolution**
   - `transpilePackages` alone doesn't work for Nx workspace libs
   - Need explicit webpack aliases in `next.config.js`
   - TypeScript paths in tsconfig are for IDE, not webpack

2. **Firebase Functions local development**
   - Use `firebase serve --only functions` (not emulators)
   - Connects to real Firebase Auth and Firestore
   - Only functions run locally as a node process
   - Requires `package.json` with `main` field in dist folder

3. **Mountain Sol auth patterns**
   - AuthGuard wraps entire app in root layout
   - Public routes defined in config array
   - `onAuthStateChanged` listener for reactive auth state
   - Client-side redirect to login for unauthenticated users

### Running locally

```bash
# Terminal 1: Start Firebase Functions
npx nx run functions:serve

# Terminal 2: Start Next.js
npx nx dev maple-spruce
```

- Frontend: http://localhost:3000
- Functions: http://localhost:5001

### To grant admin access

Add a document to `admins` collection in Firestore:
- Document ID = user's Firebase Auth UID
- Any field (e.g., `grantedAt: <timestamp>`)

## Next Steps

1. **Merge PR #21** - Inventory infrastructure complete
2. **Refine #3** - Product data model, UX, Etsy field alignment
3. **Implement #2** - Artist CRUD (needed for product-artist linking)
4. **Infrastructure tasks:**
   - #22 - Deploy Functions to Firebase (needs billing)
   - #23 - CI/CD for Functions
   - #24 - Testing infrastructure
5. **Wait for Etsy approval** - Then implement #4

## New Issues Created (2026-01-13)

| Issue | Title | Description |
|-------|-------|-------------|
| #22 | Deploy Firebase Functions to production | Manual deployment setup (needs Blaze plan) |
| #23 | Set up CI/CD for Firebase Functions | GitHub Actions for build/deploy |
| #24 | Add testing infrastructure | Jest, unit tests, integration tests |

---

*Last updated: 2026-01-13*
