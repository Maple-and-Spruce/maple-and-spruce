# Maple & Spruce - Business Requirements & Features

> Living document tracking what the platform needs to support the business

---

## Current Business State

| Aspect | Status | Notes |
|--------|--------|-------|
| Physical store | Not yet | Long timeline |
| Etsy shop | Active | Currently selling |
| Artists | Have artists | Consignment model |
| Classes | Not yet | Future when store opens |
| Music lessons | Not yet | Future when store opens |

**Key insight**: Focus on what's happening NOW (Etsy + artist payouts), not future state.

---

## Phased Roadmap

### Phase 1: Etsy + Artist Tracking (NOW)
*No store, no classes - just online sales and artist management*

- [ ] Artist management (profiles, commission rates, contact info)
- [ ] Import/sync products from Etsy
- [ ] Track which artist made which item
- [ ] When item sells on Etsy, record the sale
- [ ] Monthly payout calculation per artist
- [ ] Payout reports (what sold, commission, amount owed)

### Phase 2: Store Opening (FUTURE)
*Physical location opens - need POS and inventory*

- [ ] Barcode/SKU system for items
- [ ] Inventory tracking (in-store vs online)
- [ ] Square POS integration
- [ ] Bidirectional sync: sold in-store → remove from Etsy
- [ ] Bidirectional sync: sold on Etsy → mark unavailable in-store
- [ ] Daily/real-time inventory reconciliation

### Phase 3: Classes & Workshops (FUTURE)
*Start offering crafting classes*

- [ ] Class catalog (browse-first, not calendar-first)
- [ ] Class creation (name, description, date, cost, capacity)
- [ ] Online registration with payment
- [ ] Confirmation emails
- [ ] Customer portal (view purchased classes)
- [ ] Instructor payout tracking

### Phase 4: Music Lessons (FUTURE)
*Add music instruction*

- [ ] Teacher profiles and availability
- [ ] First-lesson booking with prepayment
- [ ] Recurring lesson scheduling
- [ ] Teacher payout tracking
- [ ] Student management

---

## Phase 1 Detail: Etsy + Artist Tracking

### User Stories

**As Katie (admin), I want to:**
- Add new artists with their info and commission rate
- See all my artists and their products
- Know when something sells on Etsy
- Generate monthly payout reports per artist
- Mark payouts as paid

**As the system, it should:**
- Pull product listings from Etsy
- Associate products with artists
- Detect when orders come in on Etsy
- Calculate artist earnings (sale price × (1 - commission))

### Data Models

```typescript
interface Artist {
  id: string;
  name: string;
  email: string;
  phone?: string;
  commissionRate: number; // e.g., 0.40 = 40% to store
  status: 'active' | 'inactive';
  notes?: string;
  createdAt: Date;
}

interface Product {
  id: string;
  artistId: string;
  name: string;
  etsyListingId?: string;
  price: number;
  status: 'available' | 'sold';
  imageUrl?: string;
  createdAt: Date;
  soldAt?: Date;
}

interface Sale {
  id: string;
  productId: string;
  artistId: string;
  salePrice: number;
  commission: number;      // amount to store
  artistEarnings: number;  // amount to artist
  source: 'etsy' | 'in_store' | 'website';
  etsyOrderId?: string;
  soldAt: Date;
}

interface Payout {
  id: string;
  artistId: string;
  periodStart: Date;
  periodEnd: Date;
  totalSales: number;
  totalCommission: number;
  amountOwed: number;
  status: 'pending' | 'paid';
  paidAt?: Date;
  sales: Sale[];
}
```

### Etsy Integration

**What we need from Etsy API:**
- List active listings (products)
- Get receipt/orders (when something sells)
- Listing details (title, price, images)

**Sync approach:**
- Pull listings on demand or scheduled
- Webhook or polling for new orders
- Match Etsy listing to our product record

---

## Technical Decisions

### Decided
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Framework | Next.js 15 | Already scaffolded |
| Monorepo | Nx | Already configured |
| Database | Firebase Firestore | NoSQL, real-time, Auth included |
| Auth | Firebase Authentication | Integrated with Firestore |
| Payments | Stripe | For future class payments |

### Phase 1 Specific
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Etsy sync | API polling initially | Webhooks require app approval |
| Artist payouts | Manual payment, tracked in system | Simple for now |

---

## Open Questions

1. **Etsy API access**: Do you have API credentials? Need to register as Etsy developer?
2. **Commission structure**: Is it the same rate for all artists or varies?
3. **Payout frequency**: Monthly? Bi-weekly?
4. **Historical data**: Need to import past Etsy sales or start fresh?

---

*Last updated: 2025-01-06*
