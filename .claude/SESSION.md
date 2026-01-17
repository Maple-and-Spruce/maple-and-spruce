# Session Context

> **DIRECTIVE**: Keep this file updated after completing tasks, making decisions, or learning new context. This ensures continuity across sessions.

---

## Current Work

**Status**: Foundation merged, ready to start Artist Management (#2).

**Recent session** (2026-01-16): Reviewed `feature/3-inventory-crud` branch against new Square architecture. Branch has valuable foundation (auth, functions, theme) but inventory UI has issues. Documented remaining work, updated PR #21, ready to merge and start #2.

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
| `build-check.yml` | PR to any branch | Build Next.js app |
| Vercel | Push to main | Deploy to production |

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

## Recent Changes

| Date | Change | PR |
|------|--------|-----|
| 2026-01-16 | Inventory foundation, auth infrastructure (partial #3) | #21 |
| 2026-01-16 | Inventory system architecture, domain type updates | #25 |
| 2026-01-11 | Infrastructure libraries (domain, validation, functions, api-types) | #21 |
| 2026-01-11 | SOL patterns documentation, issue updates, package.json deps | #19 |
| 2026-01-10 | App Hosting setup + Vercel deployment | #15 |
| 2026-01-10 | Reference repository documentation | #14 |
| 2026-01-10 | Firebase infrastructure setup (issue #7) | #13 |
| 2026-01-06 | Documentation improvements | #12 |

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

*Last updated: 2026-01-16*
