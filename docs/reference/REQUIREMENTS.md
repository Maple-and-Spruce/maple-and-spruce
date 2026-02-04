# Maple & Spruce - Business Requirements & Features

> Living document tracking what the platform needs to support the business

---

## Current Business State

| Aspect | Status | Notes |
|--------|--------|-------|
| Physical store | Not yet | Long timeline |
| Etsy shop | Active | Currently selling |
| Artists | Have artists | Consignment model |
| POS System | Square | Chosen for in-store sales |
| Admin platform | ✅ Built | Artist/product management |
| Public website | In progress | Webflow integration |
| Classes | Not yet | Future when store opens |
| Music lessons | Not yet | Future when store opens |

**Key insight**: Build public website and class/lesson infrastructure NOW. Sales tracking when store opens.

---

## Phased Roadmap

### Phase 1: Admin Foundation ✅ COMPLETE
*Artist management, product catalog, Square integration*

**1a. Artist Management** ✅
- [x] Artist management (profiles, commission rates, contact info)
- [x] Artist CRUD Cloud Functions
- [x] Artist UI (list, create, edit, delete)
- [x] Artist image upload

**1b. Square Integration** ✅
- [x] Square developer account and sandbox setup
- [x] Square Catalog API integration (create/update items)
- [x] Square Inventory API integration (track quantities)
- [x] Product creation → pushes to Square → stores IDs in Firestore
- [x] SKU generation for barcode scanning
- [x] Square webhooks for inventory/catalog changes

**1c. Product Management** ✅
- [x] Product CRUD synced with Square catalog
- [x] Artist attribution (link products to artists)
- [x] Commission rate per product (optional override)
- [x] Quantity-based inventory tracking
- [x] Category management with drag-and-drop reordering
- [x] Product filtering (search, category, artist, status)

**1d. Infrastructure** ✅
- [x] Firebase projects (dev + prod)
- [x] CI/CD with Workload Identity Federation
- [x] 19 Cloud Functions deployed
- [x] Testing (Vitest + Storybook + Chromatic)

### Phase 2: Public Website (NOW) - Epic #93
*Webflow integration for public-facing content*

**2a. Artist Showcase**
- [ ] Public API endpoint for active artists (read-only)
- [ ] Artist profile pages on Webflow
- [ ] Artist gallery/listing page
- [ ] Integration approach decision (ADR)

**2b. Workshop/Class Display**
- [ ] Class listing API (depends on Phase 3 backend)
- [ ] Upcoming classes display
- [ ] Class detail pages
- [ ] Registration flow (link to booking)

**2c. Music Lesson Information**
- [ ] Music program overview pages
- [ ] Teacher profiles (when ready)
- [ ] Inquiry/contact form for lessons

### Phase 3: Classes & Workshops - Epic #9
*Online registration and payment for crafting classes*

- [ ] Class domain types and validation
- [ ] Class CRUD Cloud Functions
- [ ] Class catalog (browse-first, not calendar-first)
- [ ] Online registration with Stripe payment
- [ ] Coupon/discount codes
- [ ] Confirmation emails
- [ ] Customer portal (view purchased classes)
- [ ] Admin: view registrations, class rosters
- [ ] Instructor payout tracking

### Phase 4: Music Lessons - Epic #10
*Intro lessons and recurring scheduling for Suzuki method instruction*

- [ ] Teacher profiles and availability management
- [ ] First-lesson booking with prepayment
- [ ] Recurring lesson scheduling (after student vetted)
- [ ] Calendar management for teachers
- [ ] Student management and progress tracking
- [ ] Teacher payout tracking
- [ ] Lesson packages (buy 4 get 1 free, etc.)

### Phase 5: Store Opening & Sales Tracking - Epic #8
*When physical store opens - POS, Etsy sync, payouts*

**5a. Square POS**
- [ ] Square POS terminal setup at store
- [ ] SKU-based barcode scanning
- [ ] Create Sale records from Square orders

**5b. Etsy Integration** (blocked on API approval)
- [ ] Etsy API integration (sync listings)
- [ ] Push Square catalog → Etsy listings
- [ ] Etsy order webhooks/polling
- [ ] Create Sale records from Etsy orders

**5c. Bidirectional Sync**
- [ ] Sale in Square → Update Etsy quantity
- [ ] Sale on Etsy → Update Square quantity
- [ ] Sync conflict detection and resolution UI

**5d. Sales & Payouts**
- [ ] Record sales from Square and Etsy
- [ ] Track which artist made which item
- [ ] Monthly payout calculation per artist
- [ ] Payout reports (what sold, commission, amount owed)
- [ ] Mark payouts as completed

---

## Inventory System Architecture

### Design Principles

1. **Hybrid source of truth** - Square owns product catalog & inventory quantities; Firestore owns consignment relationships & business logic
2. **Quantity-based model** - All products have quantity (even 1 for one-of-a-kind items)
3. **Immutable event log** - All inventory changes recorded in Firestore for audit and reconciliation
4. **Bidirectional sync** - Changes flow between inventory app, Square, and Etsy
5. **Conflict detection** - Surface sync issues in UI with resolution actions

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Maple & Spruce Inventory App                 │
│                    (Admin Interface)                            │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                         Firestore                               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────────────┐  │
│  │ Artists  │ │ Products │ │  Sales   │ │ InventoryMovements│  │
│  │          │ │ (links)  │ │          │ │                   │  │
│  └──────────┘ └──────────┘ └──────────┘ └───────────────────┘  │
│  ┌──────────┐ ┌───────────────┐                                 │
│  │ Payouts  │ │ SyncConflicts │                                 │
│  └──────────┘ └───────────────┘                                 │
└─────────────────────────────────────────────────────────────────┘
                              │
            ┌─────────────────┼─────────────────┐
            ▼                 ▼                 ▼
┌───────────────────┐ ┌───────────────┐ ┌───────────────────────┐
│   Square          │ │    Etsy       │ │  Firebase Functions   │
│   (POS Channel)   │ │   (Online     │ │  (Sync Orchestration) │
│                   │ │    Channel)   │ │                       │
│ • Catalog API     │ │ • Listings    │ │ • Webhook handlers    │
│ • Inventory API   │ │ • Orders      │ │ • Scheduled sync      │
│ • Orders/Sales    │ │ • Receipts    │ │ • Conflict detection  │
│ • Webhooks        │ │ • Webhooks    │ │                       │
└───────────────────┘ └───────────────┘ └───────────────────────┘
```

### Data Ownership

| Data | Owner | Notes |
|------|-------|-------|
| Product name, description, price | Square | Source of truth for catalog |
| Product quantity | Square | Real-time inventory state |
| SKU | Square | Generated, used for barcode |
| Product images | Square | Synced to Etsy |
| Artist profiles | Firestore | No Square equivalent |
| Product-artist relationship | Firestore | Links Square item to artist |
| Commission rates | Firestore | Default per artist, override per product |
| Sales records | Firestore | Enriched with artist attribution |
| Inventory movements | Firestore | Audit log for reconciliation |
| Payouts | Firestore | Calculated from sales |
| Sync conflicts | Firestore | Detected mismatches between systems |

### Sync Flows

**Product Creation:**
1. Admin creates product in inventory app
2. Product pushed to Square Catalog API → get `squareItemId`
3. Product pushed to Etsy Listings API → get `etsyListingId`
4. Firestore product record stores both IDs + `artistId`

**Sale in Square (POS):**
1. Customer purchases item at register
2. Square `inventory.count.updated` webhook fires
3. Firebase Function receives webhook
4. Look up product by `squareItemId` in Firestore
5. Create Sale record with artist attribution
6. Create InventoryMovement record
7. Push quantity update to Etsy

**Sale on Etsy:**
1. Customer purchases item online
2. Etsy webhook fires (or polling detects order)
3. Firebase Function receives event
4. Look up product by `etsyListingId` in Firestore
5. Create Sale record with artist attribution
6. Create InventoryMovement record
7. Square quantity may already be synced via native Etsy→Square integration

**Inventory Adjustment:**
1. Admin adjusts quantity in inventory app
2. Create InventoryMovement record in Firestore
3. Push to Square Inventory API
4. Push to Etsy Listings API

---

## Data Models

### Artist

```typescript
interface Artist {
  id: string;
  name: string;
  email: string;
  phone?: string;
  /** Default commission rate (e.g., 0.40 = 40% to store, 60% to artist) */
  defaultCommissionRate: number;
  status: 'active' | 'inactive';
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}
```

### Product

Firestore product is a **linking record** - catalog details live in Square.

```typescript
interface Product {
  id: string;
  artistId: string;

  // External system IDs (sync anchors)
  squareItemId: string;              // Required - Square is catalog owner
  squareVariationId: string;         // Square item variation ID
  squareCatalogVersion?: number;     // For optimistic locking
  etsyListingId?: string;            // Optional - may not be on Etsy

  // Cached from Square (for display without API call)
  name: string;
  price: number;
  quantity: number;
  sku: string;
  imageUrl?: string;

  // Commission override (undefined = use artist's default)
  customCommissionRate?: number;

  // Sync metadata
  lastSquareSyncAt?: Date;
  lastEtsySyncAt?: Date;

  status: 'active' | 'draft' | 'discontinued';
  createdAt: Date;
  updatedAt: Date;
}
```

### InventoryMovement (Immutable Audit Log)

```typescript
interface InventoryMovement {
  id: string;
  productId: string;

  type: InventoryMovementType;
  quantityChange: number;            // +/- delta
  quantityBefore: number;            // Snapshot for audit
  quantityAfter: number;             // Enables reconciliation

  source: InventorySource;
  sourceReference?: string;          // Order ID, receipt ID, etc.
  saleId?: string;                   // Links to Sale if type = 'sale'

  notes?: string;
  performedBy?: string;              // User ID or 'system'
  createdAt: Date;
}

type InventoryMovementType =
  | 'sale'           // Sold (decreases)
  | 'return'         // Returned (increases)
  | 'restock'        // Restocked by artist (increases)
  | 'adjustment'     // Manual correction (+/-)
  | 'damaged'        // Write-off (decreases)
  | 'initial';       // Initial stock entry

type InventorySource =
  | 'manual'         // Admin entered in inventory app
  | 'etsy'           // From Etsy webhook/sync
  | 'square'         // From Square POS
  | 'system';        // Automated (reconciliation, etc.)
```

### Sale

```typescript
interface Sale {
  id: string;
  productId: string;
  artistId: string;

  /** The price the item sold for */
  salePrice: number;
  /** Quantity sold (usually 1) */
  quantitySold: number;
  /** Amount kept by the store */
  commission: number;
  /** Amount owed to the artist */
  artistEarnings: number;
  /** Commission rate used for this sale */
  commissionRateApplied: number;

  source: SaleSource;

  // External references
  squareOrderId?: string;
  squarePaymentId?: string;
  etsyOrderId?: string;
  etsyReceiptId?: string;

  /** When the sale occurred */
  soldAt: Date;
  /** When the record was created */
  createdAt: Date;
  /** Payout ID if included in a payout */
  payoutId?: string;
}

type SaleSource = 'etsy' | 'square' | 'manual';
```

### SyncConflict

```typescript
interface SyncConflict {
  id: string;
  productId: string;

  type: SyncConflictType;
  detectedAt: Date;

  // Snapshot of states when conflict detected
  localState: {
    quantity: number;
    price: number;
    name: string;
  };
  externalState: {
    system: 'etsy' | 'square';
    quantity: number;
    price: number;
    name: string;
  };

  status: 'pending' | 'resolved' | 'ignored';
  resolution?: SyncResolution;
  resolvedAt?: Date;
  resolvedBy?: string;
  notes?: string;
}

type SyncConflictType =
  | 'quantity_mismatch'    // Quantities don't match
  | 'price_mismatch'       // Prices don't match
  | 'missing_local'        // Exists externally, not locally
  | 'missing_external'     // Exists locally, not externally
  | 'unexpected_sale';     // Sale on channel we didn't expect

type SyncResolution =
  | 'use_local'            // Push our data to external
  | 'use_external'         // Pull external data to us
  | 'manual'               // User manually resolved
  | 'ignored';             // Acknowledged but not fixed
```

### Payout

```typescript
interface Payout {
  id: string;
  artistId: string;
  periodStart: Date;
  periodEnd: Date;

  /** Number of sales in this payout */
  saleCount: number;
  /** Sum of sale prices */
  totalSales: number;
  /** Sum of commissions (to store) */
  totalCommission: number;
  /** Amount owed to artist */
  amountOwed: number;

  status: 'pending' | 'paid';
  paidAt?: Date;
  paymentMethod?: string;
  paymentReference?: string;
  notes?: string;

  createdAt: Date;
  updatedAt: Date;
}
```

---

## Commission Logic

```typescript
function getCommissionRate(product: Product, artist: Artist): number {
  // Product override takes precedence
  if (product.customCommissionRate !== undefined) {
    return product.customCommissionRate;
  }
  // Fall back to artist's default
  return artist.defaultCommissionRate;
}

function calculateSaleAmounts(
  salePrice: number,
  commissionRate: number
): { commission: number; artistEarnings: number } {
  const commission = Math.round(salePrice * commissionRate * 100) / 100;
  const artistEarnings = Math.round((salePrice - commission) * 100) / 100;
  return { commission, artistEarnings };
}
```

---

## Square Integration Details

### Required APIs

| API | Purpose | Permissions |
|-----|---------|-------------|
| Catalog API | Create/update products | ITEMS_READ, ITEMS_WRITE |
| Inventory API | Track quantities | INVENTORY_READ, INVENTORY_WRITE |
| Orders API | Read completed sales | ORDERS_READ |
| Webhooks | Real-time notifications | N/A |

### Webhook Events

| Event | Trigger | Our Action |
|-------|---------|------------|
| `inventory.count.updated` | Sale or manual adjustment | Record sale, sync to Etsy |
| `catalog.version.updated` | Item modified in Square | Sync changes to Firestore cache |

### SKU Format

Opaque unique identifier - no encoded semantics.

Format: `prd_[random]` (e.g., `prd_a1b2c3d4`)

Generated when product is created, stored in Square and used for barcode scanning.

---

## Etsy Integration Details

### Required APIs

| Endpoint | Purpose |
|----------|---------|
| `getShopListings` | Fetch current listings |
| `getListing` | Get listing details |
| `updateListingInventory` | Update quantity |
| `getShopReceipts` | Get orders/sales |

### Webhook/Polling

Etsy webhooks require app approval. Initial implementation uses polling:
- Check for new receipts every 5-15 minutes
- Full inventory reconciliation daily

---

## Technical Decisions

### Decided

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Next.js 15 | Already scaffolded |
| Monorepo | Nx | Already configured |
| Database | Firebase Firestore | NoSQL, real-time, Auth included |
| Auth | Firebase Authentication | Integrated with Firestore |
| POS | Square | Industry standard, good API |
| Online Sales | Etsy | Already selling there |
| Payments (classes) | Stripe | For future class payments |

### Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Inventory source of truth | Hybrid (Square + Firestore) | Square for catalog/quantity, Firestore for consignment |
| Product record in Firestore | Linking record | Stores external IDs + artist relationship |
| Audit log | InventoryMovement collection | Immutable events enable reconciliation |
| Sync conflicts | Surface in UI | Don't auto-resolve - let admin decide |
| SKU format | Opaque (`prd_xxx`) | No semantic encoding needed |

---

## Answered Questions

| Question | Answer |
|----------|--------|
| Commission structure | Default rate per artist, with per-product override option |
| Unique vs quantity items | Quantity-based (supports both one-of-a-kind and multiples) |
| Etsy sync approach | Event-based (webhooks when approved, polling as fallback) |
| Square plan | Start with Free, evaluate Retail Plus for barcode printing |
| Third-party sync tools | Build custom for full control over consignment logic |

---

## Open Questions

1. **Payout frequency**: Monthly? Bi-weekly?
2. **Historical data**: Need to import past Etsy sales or start fresh?
3. **Square account**: Need to create Square developer account and register app

---

*Last updated: 2025-01-19*
