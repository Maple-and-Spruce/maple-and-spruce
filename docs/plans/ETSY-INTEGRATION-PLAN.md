# Etsy Integration Implementation Plan

> **Phase**: 5b (Store Opening & Sales Tracking)
> **Status**: Planning
> **Date**: 2026-03-27
> **Issue**: #4
> **Epic**: #8

---

## Summary

Integrate with Etsy API v3 to sync product listings and track orders from the existing Etsy shop. This enables bidirectional inventory sync between the admin app, Square POS, and Etsy — completing the multi-channel sales infrastructure.

### System Context

```
                    ┌──────────────────────────┐
                    │   Admin App (Firestore)   │
                    │   - Artist relationships  │
                    │   - Commission rates      │
                    │   - Inventory movements   │
                    └────────┬─────────────────┘
                             │
                    ┌────────┴─────────────────┐
                    │                           │
              ┌─────▼─────┐             ┌──────▼──────┐
              │  Square    │             │    Etsy     │
              │  (POS)     │             │  (Online)   │
              │            │             │             │
              │ • Catalog  │             │ • Listings  │
              │ • Quantity │             │ • Receipts  │
              │ • Payments │             │ • Inventory │
              └────────────┘             └─────────────┘
```

### Key Constraints

| Constraint | Detail |
|------------|--------|
| API tier | Personal Access (5 QPS / 5K QPD sliding window) |
| Auth | OAuth 2.0 with PKCE — 1-hour access tokens, 90-day refresh tokens |
| Webhooks | Likely unavailable on Personal Access — use polling |
| App name | `maplspruce-listings` |
| API key format | `keystring:shared_secret` (required since Jan 2026) |

---

## Architecture Decisions

### ADR-027: Etsy OAuth Token Management

**Context:** Etsy requires OAuth 2.0 even for Personal Access apps. Access tokens expire in 1 hour, refresh tokens in 90 days.

**Decision:** Store OAuth tokens in Firestore (`_config/etsy-tokens` document). A utility function refreshes the access token when expired. The initial OAuth authorization is performed once via a one-time admin endpoint or CLI script.

**Rationale:**
- Firebase secrets are static — can't store rotating tokens there
- Firestore document is accessible from all Cloud Functions
- Single token document since we only connect one shop (Personal Access)
- Refresh-on-use pattern avoids scheduled token refresh overhead

**Token Document Structure:**
```typescript
interface EtsyTokenDocument {
  accessToken: string;
  refreshToken: string;
  expiresAt: Timestamp;     // accessToken expiry
  shopId: string;           // Etsy shop ID
  userId: string;           // Etsy user ID
  updatedAt: Timestamp;
}
```

### ADR-028: Etsy Sync Strategy — Polling Only

**Context:** Etsy webhooks may not be available on Personal Access tier. Even if available, webhook payloads are minimal (just a resource URL) requiring follow-up API calls.

**Decision:** Use scheduled polling as the primary sync mechanism. No webhook handler initially.

**Polling Schedule:**
| Job | Frequency | Daily API Cost |
|-----|-----------|----------------|
| New receipts | Every 15 minutes | ~96 calls/day |
| Inventory reconciliation | Daily at 3am ET | ~5-20 calls |
| Listing sync | Daily at 3am ET | ~5-20 calls |
| **Total** | | ~120/day (well within 5K) |

**Rationale:**
- Polling is reliable and doesn't depend on Etsy's webhook availability
- 15-minute receipt polling is sufficient for a small shop
- Daily reconciliation catches any drift
- Can add webhooks later if/when approved for commercial access

### ADR-029: Etsy as Secondary Channel (Square Remains Source of Truth)

**Context:** Products are created in the admin app and pushed to Square first (existing flow). Etsy is an additional sales channel.

**Decision:** Maintain Square as the catalog source of truth. Etsy listings are created from existing Product records (which already have Square data). The Product record gains an `etsyCache` field mirroring the `squareCache` pattern.

**Sync Flow:**
```
Admin creates product → Push to Square (existing) → Push to Etsy (new)
                                                         ↓
Etsy receipt detected → Create Sale + InventoryMovement → Update Square quantity
```

---

## Implementation Steps

### Step 1: Etsy Client Library

**Create:** `libs/firebase/etsy/`

Mirror the Square library pattern with these services:

#### 1a. OAuth Service (`oauth.service.ts`)

Handles token lifecycle:
- `getValidAccessToken()` — Read token from Firestore, refresh if expired
- `refreshAccessToken()` — Exchange refresh token for new access token
- `exchangeAuthorizationCode(code, codeVerifier)` — Initial OAuth flow

```typescript
// Token refresh endpoint
POST https://api.etsy.com/v3/public/oauth/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&client_id={keystring}
&refresh_token={refresh_token}
```

#### 1b. Listing Service (`listing.service.ts`)

| Method | Etsy Endpoint | Purpose |
|--------|---------------|---------|
| `getActiveListings()` | `GET /shops/{id}/listings?state=active` | Fetch all active listings |
| `getListing(id)` | `GET /listings/{id}` | Get single listing with includes |
| `createDraftListing(data)` | `POST /shops/{id}/listings` | Create draft listing |
| `updateListing(id, data)` | `PATCH /shops/{id}/listings/{id}` | Update listing fields |
| `uploadListingImage(id, image)` | `POST /shops/{id}/listings/{id}/images` | Upload image (multipart) |
| `activateListing(id)` | `PATCH /shops/{id}/listings/{id}` | Set state to active |

**Important:** Always use `includes=Images,Inventory` on GET requests to save API calls.

#### 1c. Inventory Service (`inventory.service.ts`)

| Method | Etsy Endpoint | Purpose |
|--------|---------------|---------|
| `getInventory(listingId)` | `GET /listings/{id}/inventory` | Get current inventory |
| `updateInventory(listingId, quantity)` | `PUT /listings/{id}/inventory` | Full replacement update |

**Critical gotcha:** `updateInventory` is a full replacement. Must:
1. GET current inventory
2. Strip server-only fields (`product_id`, `offering_id`, `scale_name`, `is_deleted`, `value_pairs`)
3. Convert price from `{amount, divisor, currency_code}` to decimal float
4. Modify quantity
5. PUT entire `products` array back

#### 1d. Receipt Service (`receipt.service.ts`)

| Method | Etsy Endpoint | Purpose |
|--------|---------------|---------|
| `getReceipts(since)` | `GET /shops/{id}/receipts?min_last_modified={ts}` | Poll for new/updated orders |
| `getReceipt(id)` | `GET /shops/{id}/receipts/{id}` | Get single receipt |

#### 1e. Taxonomy Service (`taxonomy.service.ts`)

| Method | Etsy Endpoint | Purpose |
|--------|---------------|---------|
| `getTaxonomyNodes()` | `GET /seller-taxonomy/nodes` | Get category tree for listing creation |

Cache taxonomy locally — it changes infrequently.

---

### Step 2: OAuth Bootstrap

**Create:** `libs/firebase/maple-functions/etsy-oauth/`

A callable Cloud Function pair for the one-time OAuth authorization:

1. **`etsyAuthUrl`** — Generates OAuth URL with PKCE challenge, stores code verifier in Firestore
2. **`etsyAuthCallback`** — Exchanges authorization code for tokens, stores in Firestore

**Flow:**
```
Admin clicks "Connect Etsy" in admin app
  → etsyAuthUrl() returns URL
  → Admin redirected to Etsy, approves
  → Etsy redirects to callback URL
  → etsyAuthCallback() exchanges code for tokens
  → Tokens stored in Firestore _config/etsy-tokens
```

**Secrets needed:**
| Secret | Description |
|--------|-------------|
| `ETSY_API_KEY` | Keystring from Etsy developer dashboard |
| `ETSY_SHARED_SECRET` | Shared secret (for x-api-key header) |

**Codebase:** Deploy in `maple-sync` (alongside Webflow sync functions — both are external API integrations).

---

### Step 3: Push Products to Etsy

**Create:** `libs/firebase/maple-functions/push-product-to-etsy/`

Callable Cloud Function: given a Product ID, create/update the corresponding Etsy listing.

**Create flow:**
1. Load Product from Firestore (must have `squareCache` data)
2. Look up taxonomy ID (cache in Firestore `_config/etsy-taxonomy`)
3. Create draft listing on Etsy
4. Upload image from Square `imageUrl`
5. Set inventory quantity
6. Activate listing
7. Store `etsyListingId` on Product record
8. Create `etsyCache` on Product record

**Update flow:**
1. Load Product, check `etsyListingId` exists
2. PATCH listing with changed fields
3. Update inventory if quantity changed
4. Update `etsyCache.syncedAt`

**Product record additions:**
```typescript
// Add to Product interface
etsyCache?: {
  title: string;
  description?: string;
  priceCents: number;
  quantity: number;
  url?: string;           // Etsy listing URL
  taxonomyId: number;
  syncedAt: Date;
};
lastEtsySyncAt?: Date;    // Already exists in domain type
```

**Codebase:** `maple-sync`

---

### Step 4: Poll for Etsy Receipts

**Create:** `libs/firebase/maple-functions/poll-etsy-receipts/`

Scheduled Cloud Function running every 15 minutes.

**Logic:**
1. Get last poll timestamp from Firestore (`_config/etsy-poll-state`)
2. Fetch receipts from Etsy with `min_last_modified` = last poll time
3. For each paid receipt:
   a. Look up Product by `etsyListingId`
   b. If product found and receipt not already processed:
      - Create `Sale` record (source: 'etsy')
      - Create `InventoryMovement` record (source: 'etsy', type: 'sale')
      - Update `squareCache.quantity` via Square Inventory API (decrement)
      - Update `etsyCache.quantity` on Product
4. Update last poll timestamp

**Deduplication:** Check for existing Sale with matching `etsyReceiptId` before creating.

**Codebase:** `maple-sync`

---

### Step 5: Daily Inventory Reconciliation

**Create:** `libs/firebase/maple-functions/reconcile-etsy-inventory/`

Scheduled Cloud Function running daily at 3am ET.

**Logic:**
1. Fetch all active Etsy listings (paginated, 100 per request)
2. For each listing with a linked Product:
   a. Compare Etsy quantity with `etsyCache.quantity`
   b. Compare Etsy quantity with Square quantity
   c. If mismatch detected → Create `SyncConflict` record
3. Update `etsyCache` on all synced products

**Codebase:** `maple-sync`

---

### Step 6: Admin UI for Etsy

#### 6a. Etsy Connection Status

Add to admin dashboard:
- Connection status (token valid / expired / not connected)
- Shop name and listing count
- Last sync timestamp
- "Connect Etsy" button (triggers OAuth flow from Step 2)

#### 6b. Product → Etsy Push

Add to Product detail/edit page:
- "Push to Etsy" button (calls Step 3 function)
- Etsy listing status indicator
- Link to Etsy listing

#### 6c. Sync Conflicts

The existing sync conflict UI already supports `externalSystem: 'etsy'`. No new UI needed — Etsy conflicts will appear alongside Square conflicts.

---

## PR Sequence

| PR | Scope | Dependencies |
|----|-------|-------------|
| **PR 1** | Etsy client library (`libs/firebase/etsy/`) + OAuth service + token types | None |
| **PR 2** | OAuth bootstrap functions (etsyAuthUrl + etsyAuthCallback) + secrets setup | PR 1 |
| **PR 3** | Push product to Etsy function + Product domain `etsyCache` field | PR 1 |
| **PR 4** | Receipt polling function + Sale creation from Etsy orders | PR 1 |
| **PR 5** | Daily reconciliation function + sync conflict detection | PR 1 |
| **PR 6** | Admin UI — Etsy connection, push button, status indicators | PRs 2-5 |

PRs 3, 4, and 5 can be developed in parallel after PR 1 merges.

---

## Secrets to Configure

| Secret | Firebase Config Key | Value Source |
|--------|-------------------|-------------|
| `ETSY_API_KEY` | `defineSecret('ETSY_API_KEY')` | Etsy developer dashboard → App → Keystring |
| `ETSY_SHARED_SECRET` | `defineSecret('ETSY_SHARED_SECRET')` | Etsy developer dashboard → App → Shared Secret |

Set in both projects:
```bash
firebase functions:secrets:set ETSY_API_KEY --project maple-and-spruce
firebase functions:secrets:set ETSY_API_KEY --project maple-and-spruce-dev
firebase functions:secrets:set ETSY_SHARED_SECRET --project maple-and-spruce
firebase functions:secrets:set ETSY_SHARED_SECRET --project maple-and-spruce-dev
```

**Note:** OAuth tokens (access + refresh) are stored in Firestore, not Firebase secrets, because they rotate.

---

## Rate Limit Budget

| Operation | Calls | Frequency | Daily Total |
|-----------|-------|-----------|-------------|
| Receipt polling | 1-2 | Every 15 min | ~144 |
| Listing sync (daily) | 5-20 | Daily | ~20 |
| Inventory reconciliation | 5-20 | Daily | ~20 |
| Manual pushes | 1-5 | Ad hoc | ~10 |
| Token refresh | 1 | Hourly when active | ~24 |
| **Total** | | | **~218/day** |

Comfortable margin within 5,000 QPD limit.

---

## Open Questions

1. **Etsy shop ID** — Need to get this from the Etsy developer dashboard or API. Required for all shop-specific endpoints.
2. **Taxonomy mapping** — Which Etsy taxonomy categories map to Maple & Spruce product types? Need to explore the taxonomy tree.
3. **Shipping profiles** — Physical items require a `shipping_profile_id`. Does the existing Etsy shop already have shipping profiles set up?
4. **who_made / when_made** — Required listing fields. Default to `"someone_else"` (consignment) and current year range?
5. **Existing Etsy listings** — Should we import existing listings and link them to Firestore products, or only push new products to Etsy going forward?
6. **Square ↔ Etsy native integration** — Does Etsy's built-in Square integration handle any of this already? If so, we may only need receipt polling + sale attribution, not inventory sync.
