# Maple & Spruce - Architecture Decision Records (ADRs)

> Document important technical decisions and their reasoning

---

## ADR-001: Use Next.js App Router

**Status:** Accepted
**Date:** 2025-01-06

### Context
Need a React framework for building the platform.

### Decision
Use Next.js 15 with App Router (already scaffolded in repo).

### Rationale
- Full-stack framework (API routes built-in)
- Server Components reduce client JavaScript
- Great developer experience
- Strong community and documentation
- Vercel deployment is simple

### Consequences
- Locked into React ecosystem
- Some learning curve for App Router patterns
- Server Components have different mental model

---

## ADR-002: Nx Monorepo

**Status:** Accepted
**Date:** 2025-01-06

### Context
Need to manage shared code between apps and packages.

### Decision
Use Nx for monorepo management (already configured).

### Rationale
- Proven at scale (Mountain Sol uses it)
- Great caching for faster builds
- Dependency graph visualization
- Consistent tooling across projects
- Can add more apps later (e.g., mobile)

### Consequences
- Additional complexity vs single app
- Learning curve for Nx commands
- Configuration overhead

---

## ADR-003: Catalog-First Class Browsing

**Status:** Accepted
**Date:** 2025-01-06

### Context
Users need to browse and register for classes. Common patterns are calendar-first or catalog-first.

### Decision
Use catalog-first browsing (browse classes as cards/list, not a calendar view).

### Rationale
- Katie explicitly preferred this approach
- Better for discovery (see what's offered)
- Calendar works for recurring events; classes are more one-off
- Easier to showcase class descriptions and photos
- Can add calendar view later as secondary navigation

### Consequences
- Need good filtering (by date, category, instructor)
- Date/time displayed on each class card
- Calendar view could be added as enhancement later

---

## ADR-004: Firebase Stack for Backend

**Status:** Accepted
**Date:** 2025-01-06

### Context
Need database, authentication, and backend functions. Options: Firebase, Supabase, PlanetScale + Auth0, etc.

### Decision
Use Firebase (Firestore + Firebase Auth + Cloud Functions).

### Rationale
- Proven stack - Mountain Sol platform uses this successfully
- Already familiar with the patterns and tooling
- Firestore works well for document-based data (products, artists, sales)
- Firebase Auth is simple to set up
- Cloud Functions for backend logic
- Good free tier (Spark plan) for starting out
- Scales well when needed

### Alternatives Considered
- **Supabase**: PostgreSQL-based, good but unfamiliar
- **PlanetScale + Auth0**: More complex setup, higher cost

### Consequences
- Firestore's document model requires thinking about data structure upfront
- Cloud Functions cold starts (minor issue)
- Google Cloud ecosystem

---

## ADR-005: Stripe for Payments

**Status:** Accepted
**Date:** 2025-01-06

### Context
Need payment processing for classes and (later) products.

### Decision
Use Stripe.

### Rationale
- Industry standard, well-documented
- Great developer experience
- Handles PCI compliance
- Supports subscriptions (for future lesson packages)
- Good webhook system
- Works well with Next.js and Firebase

### Alternatives Considered
- **Square Payments**: Would unify with POS, but less developer-friendly
- **PayPal**: Lower developer experience, older patterns
- **Braintree**: Mountain Sol uses this, but Stripe is simpler for new projects

### Consequences
- 2.9% + 30¢ per transaction
- Need to handle webhooks properly
- Separate from Square POS system (if used later)

---

## ADR-006: Repository Pattern for Data Access

**Status:** Accepted
**Date:** 2025-01-06

### Context
Need a pattern for database access that's testable and maintainable.

### Decision
Use Repository Pattern (inspired by Mountain Sol).

### Rationale
- Abstracts Firestore implementation from business logic
- Single place for all queries per entity
- Easy to mock for testing
- Proven pattern from Mountain Sol codebase

### Consequences
- More files/boilerplate
- Need discipline to use repositories consistently
- Worth it for maintainability

---

## ADR-007: Google Material Design

**Status:** Accepted
**Date:** 2025-01-06

### Context
Need a design system/component library for consistent UI.

### Decision
Use Google Material Design as the design language.

### Rationale
- Well-documented design system
- Comprehensive component library available (MUI for React)
- Accessible by default
- Familiar patterns for users
- Good documentation and examples

### Implementation
- Use MUI (Material UI) v5+ for React components
- Customize theme to match brand colors

### Consequences
- Apps will have Material "feel" (can be customized)
- Large dependency (MUI), but tree-shakeable
- Consistent look across all admin and customer interfaces

---

## ADR-008: Brand Color Palette

**Status:** Accepted
**Date:** 2025-01-06

### Context
Need consistent colors across the platform that match the Maple & Spruce brand.

### Decision
Use the earthy color palette from the Webflow marketing site.

### Color Palette
| Name | Hex | Usage |
|------|-----|-------|
| Cream | `#D5D6C8` | Backgrounds, cards |
| Dark Brown | `#4A3728` | Headings, logo, primary text |
| Sage Green | `#6B7B5E` | Buttons, accents, CTAs |
| Warm Gray | `#7A7A6E` | Body text, secondary text |
| White | `#FFFFFF` | Cards, inputs, contrast areas |

### Rationale
- Matches existing Webflow brand site
- Earthy, natural tones fit "folk arts collective" identity
- Good contrast ratios for accessibility
- Warm and inviting feel

### Implementation
- Configure as MUI theme palette
- Primary: Sage Green (`#6B7B5E`)
- Secondary: Dark Brown (`#4A3728`)
- Background: Cream (`#D5D6C8`)

### Consequences
- All UI follows this palette
- Need to verify accessibility contrast ratios
- May need lighter/darker variants for states (hover, disabled)

---

## ADR-009: Square POS for In-Store Sales

**Status:** Accepted
**Date:** 2026-01-16

### Context
Need a point-of-sale system for when the physical store opens. Must support barcode scanning, inventory tracking, and have good API access for integration.

### Decision
Use Square as the POS system.

### Rationale
- Industry standard for small retail
- Robust free tier with inventory management included
- Comprehensive API (Catalog, Inventory, Orders, Webhooks)
- Native Etsy integration (one-way, but helpful)
- Barcode scanning support built-in
- Good developer documentation

### Alternatives Considered
- **Shopify POS**: Good but more expensive, heavier e-commerce focus
- **Clover**: Less developer-friendly API
- **Custom solution**: Too much work, not worth rebuilding POS

### Consequences
- Square becomes catalog/inventory source of truth
- Need to sync product data to Square
- Square Webhooks required for real-time sale detection
- May need Retail Plus plan ($89/mo) for barcode label printing

---

## ADR-010: Hybrid Inventory Architecture (Square + Firestore)

**Status:** Accepted
**Date:** 2026-01-16

### Context
Need to track inventory for consignment business with multiple sales channels (Square POS, Etsy). Square has excellent inventory capabilities but no concept of consignment, artist attribution, or commission splits. Building everything custom in Firestore would duplicate Square's well-built inventory features.

### Decision
Use a hybrid architecture:
- **Square** owns product catalog (name, price, images) and inventory quantities
- **Firestore** owns consignment relationships (artists, commissions, payouts) and sales attribution

Firestore `Product` records are **linking records** that store:
- External IDs (`squareItemId`, `etsyListingId`)
- Artist relationship (`artistId`)
- Commission override (`customCommissionRate`)
- Cached display data (synced from Square)

### Rationale
1. **Don't rebuild what Square does well** - POS, inventory states, barcode scanning, real-time sync
2. **Square can't model consignment** - No artist profiles, commission splits, or payout tracking
3. **Firestore handles business logic** - Artist attribution, commission calculation, payout generation
4. **Single linking record** - One place to find a product's Square ID, Etsy ID, and artist
5. **Audit trail in Firestore** - InventoryMovement collection provides immutable event log for reconciliation

### Alternatives Considered

**Option A: Square as sole source of truth**
- Store artistId/commission in Square custom attributes
- Rejected: 10 hidden attribute limit, no artist profiles, commission logic still needed

**Option B: Firestore as sole source of truth**
- Mirror all Square data, treat Square as "dumb" POS
- Rejected: Duplicates Square's excellent inventory tracking, more sync complexity

**Option C: Third-party inventory tool (Trunk, SKUPlugs)**
- Let them handle Square↔Etsy sync
- Rejected: No consignment model, less control, ongoing cost

### Data Ownership

| Data | Owner | Sync Direction |
|------|-------|----------------|
| Product name, description, price, images | Square | Square → Firestore (cache) |
| Quantity, inventory states | Square | Square → Firestore (cache) |
| SKU | Square | Generated on create |
| Artist profiles | Firestore | N/A |
| Product-artist link | Firestore | N/A |
| Commission rates | Firestore | N/A |
| Sales records | Firestore | Square/Etsy → Firestore |
| Payouts | Firestore | N/A |
| Sync conflicts | Firestore | N/A |

### Consequences

**Easier:**
- Leverage Square's POS and inventory features without rebuilding
- Clear separation: Square = retail operations, Firestore = business logic
- Day-to-day inventory management can happen in Square Dashboard
- Audit trail enables reconciliation and debugging

**Harder:**
- Two systems to keep in sync
- Must handle Square webhook events correctly
- Cached data in Firestore could become stale
- Need to coordinate creates/updates across systems

---

## ADR-011: Immutable Inventory Event Log

**Status:** Accepted
**Date:** 2026-01-16

### Context
Need to track inventory changes for auditing, reconciliation, and debugging sync issues. Mutable quantity field alone doesn't explain how we got to current state.

### Decision
Create an `InventoryMovement` collection in Firestore that records every inventory change as an immutable event.

Each movement records:
- Product ID
- Movement type (sale, return, restock, adjustment, damaged, initial)
- Quantity change (+/-)
- Quantity before and after (snapshots)
- Source (manual, etsy, square, system)
- External reference (order ID, etc.)
- Timestamp and performer

### Rationale
- **Audit trail** - Know exactly what happened and when
- **Reconciliation** - Sum of movements should equal current quantity
- **Debugging** - Trace sync issues back to source
- **Event sourcing lite** - Can replay history if needed

### Consequences
- More storage (one document per change)
- Must remember to create movement when changing quantity
- Enables powerful reporting and debugging
- Background function can verify data integrity

---

## ADR-012: Sync Conflict Detection and Manual Resolution

**Status:** Accepted
**Date:** 2026-01-16

### Context
With bidirectional sync between inventory app, Square, and Etsy, conflicts are inevitable. Examples: someone edits price in Etsy directly, Square and Firestore quantities drift, unexpected sale on one channel.

### Decision
- Detect conflicts during sync operations
- Store conflicts in `SyncConflict` collection with snapshots of both states
- Surface pending conflicts in admin UI dashboard
- Provide resolution actions: use local, use external, manual fix, ignore
- Do NOT auto-resolve - always let admin decide

### Rationale
- Auto-resolution could cause data loss or incorrect inventory
- Admin knows context (e.g., "I intentionally set different prices")
- Snapshot at detection time preserves evidence
- Ignore option for known acceptable differences

### Consequences
- Admin must periodically review conflicts
- UI needed to display and resolve conflicts
- Better data integrity than silent auto-resolution
- Clear audit trail of what was wrong and how it was fixed

---

## ADR-013: Square Cache Synchronization Strategy

**Status:** Accepted
**Date:** 2026-01-18

### Context
The Product record in Firestore stores cached data from Square (name, price, quantity, SKU) for fast reads without API calls. Need a strategy for keeping this cache fresh while balancing complexity, cost, and real-time requirements.

### Decision
Use a three-pronged synchronization strategy:

1. **Webhooks (Real-time)** - Primary mechanism for critical changes
2. **Lazy Refresh (On-demand)** - Refresh stale cache when product is accessed
3. **Periodic Sync (Safety net)** - Nightly batch sync catches anything missed

### Implementation Details

**Webhooks:**
- Subscribe to `inventory.count.updated` for quantity changes
- Subscribe to `catalog.version.updated` for price/name changes
- Webhook handler updates Firestore cache and `syncedAt` timestamp
- Create Sale record when inventory decreases (for artist attribution)

**Lazy Refresh:**
- On product read, check if `squareCache.syncedAt` is older than threshold (5 minutes)
- If stale, fetch fresh data from Square API before returning
- Update cache in Firestore asynchronously
- Configurable threshold via `CACHE_STALE_THRESHOLD_MS`

**Periodic Sync:**
- Scheduled Cloud Function runs nightly
- Batch fetches all products from Square Catalog API
- Compares with Firestore cache, updates differences
- Logs discrepancies for review
- Acts as safety net for missed webhooks

### Data Structure

```typescript
interface Product {
  // ... owned fields ...

  squareCache: {
    name: string;
    description?: string;
    priceCents: number;
    quantity: number;
    sku: string;
    imageUrl?: string;
    syncedAt: Date;  // When cache was last refreshed
  };
}
```

### Rationale

**Why not just webhooks?**
- Webhooks can fail (network issues, function errors)
- Square has retry limits
- Need a fallback mechanism

**Why not just polling?**
- Real-time matters for sales (artist attribution)
- Polling is wasteful for infrequent changes
- Higher API costs

**Why not just lazy refresh?**
- First user after long gap gets slow response
- Some products may never be accessed

**Combined approach gives:**
- Real-time for sales and critical changes
- Good read performance (usually hit cache)
- Self-healing (periodic sync catches drift)
- No single point of failure

### Consequences

**Benefits:**
- Fast reads (usually from cache)
- Real-time sale detection for payouts
- Self-correcting system
- Clear visibility into cache freshness via `syncedAt`

**Complexity:**
- Three sync paths to implement and maintain
- Need to handle partial failures (webhook success, Firestore update fails)
- Must ensure idempotency (same update applied twice = no harm)

**Cost:**
- Webhook processing (pay per invocation)
- Periodic sync API calls (but batched, once daily)
- Lazy refresh API calls (but only for stale products)

---

## ADR-014: Storybook for Component Testing

**Status:** Accepted
**Date:** 2026-01-19

### Context
The project needs a component testing and documentation strategy. Current test coverage is minimal (only E2E scaffolding exists). Need a systematic way to test React components, document component variations, and catch visual regressions.

### Decision
Use Storybook 10 with `@storybook/nextjs` framework and `@storybook/addon-a11y` for accessibility testing, plus Chromatic for visual regression testing in CI.

### Rationale
- **Visual documentation** - Storybook provides living documentation of all components
- **Accessibility** - Built-in a11y addon catches WCAG issues automatically
- **Chromatic integration** - Visual regression testing in PR reviews
- **Next.js support** - `@storybook/nextjs` handles Next.js-specific features (App Router, image optimization)
- **Nx integration** - `@nx/storybook` provides seamless build targets
- **Industry standard** - Widely adopted, excellent documentation, strong ecosystem

### Alternatives Considered
- **Jest + React Testing Library only** - Good for unit tests but no visual documentation
- **Playwright component testing** - New, less mature ecosystem
- **Ladle** - Simpler alternative but fewer features and community support

### Consequences
**Easier:**
- Component variations documented visually
- Accessibility issues caught early
- Visual regressions detected automatically in PRs
- New developers can explore components quickly

**Harder:**
- Additional dependencies (~50MB)
- Stories must be maintained alongside components
- Chromatic free tier limited to 5,000 snapshots/month
- Components using Firebase hooks need mocking

### Implementation
- Storybook config: `apps/maple-spruce/.storybook/`
- Mock fixtures: `apps/maple-spruce/.storybook/fixtures/`
- CI workflow: `.github/workflows/chromatic.yml`
- Vercel deployment: Separate project for Storybook hosting

---

## ADR-015: Preact Signals for Form State Management

**Status:** Accepted
**Date:** 2026-01-19

### Context
Complex forms (like ProductForm) currently use multiple `useState` calls, manual dependency tracking in `useMemo`, and explicit error clearing logic. Mountain Sol is adopting Angular signals for state management to simplify logic and ensure correctness. Need an equivalent pattern for the React/Next.js stack.

### Decision
Adopt [Preact Signals](https://github.com/preactjs/signals) (`@preact/signals-react`) for form state management, starting with a pilot on ProductForm.

Key patterns:
- **`signal(value)`** - Replaces `useState` for form fields
- **`computed(fn)`** - Replaces `useMemo` with automatic dependency tracking
- **`effect(fn)`** - Replaces `useEffect` with automatic cleanup
- **`batch(fn)`** - Groups multiple updates for single re-render

### Rationale
1. **Automatic dependency tracking** - No manual dependency arrays to maintain
2. **Fine-grained reactivity** - Each field updates independently (fewer re-renders)
3. **Cleaner validation** - Vest + computed signals = always-current validation state
4. **Mountain Sol alignment** - Same conceptual model as Angular signals enables knowledge sharing
5. **Minimal bundle impact** - ~2KB gzipped
6. **React 19 compatible** - Confirmed working with React 19 and the React Compiler

### Alternatives Considered
- **Zustand** - Good for global state, but no fine-grained reactivity
- **Jotai** - Similar atomic model, but more complex atom composition
- **React Hook Form** - Form-specific, doesn't address derived state patterns
- **XState** - Too heavyweight for form state

### Consequences

**Easier:**
- Validation always reflects current state (no stale errors)
- No need to manually clear errors on field change
- Derived values (isValid, errors) update automatically
- Simpler mental model - state flows naturally

**Harder:**
- New pattern for team to learn
- Must use `.value` to read/write (easy to forget)
- Signals shouldn't be destructured (breaks reactivity)
- Mixing signals and regular state can be confusing

### Implementation
- Library: `libs/react/signals/` - Re-exports with project utilities
- Pilot: `ProductFormSignals.tsx` - Side-by-side with original
- Docs: `SIGNALS-ADOPTION-PLAN.md`, `SIGNALS-MIGRATION-GUIDE.md`
- Next: Evaluate after pilot, expand to other forms if successful

### Migration Strategy
1. Create new signal-based component alongside existing
2. Swap in page when ready
3. Keep original until confidence is high
4. Delete original after validation period

---

## Template for New Decisions

```markdown
## ADR-XXX: [Title]

**Status:** Proposed | Accepted | Deprecated | Superseded
**Date:** YYYY-MM-DD

### Context
What is the issue that we're seeing that is motivating this decision?

### Decision
What is the change that we're proposing/doing?

### Rationale
Why is this the best choice?

### Alternatives Considered
What other options were evaluated?

### Consequences
What becomes easier or harder as a result?
```

---

*Last updated: 2026-01-19*
