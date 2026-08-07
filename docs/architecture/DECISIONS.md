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

**Status:** Superseded by ADR-021 (Square for All Payments)
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

**Status:** Implemented
**Date:** 2026-01-19
**Updated:** 2026-01-21

### Context
Complex forms (like ProductForm) currently use multiple `useState` calls, manual dependency tracking in `useMemo`, and explicit error clearing logic. Mountain Sol is adopting Angular signals for state management to simplify logic and ensure correctness. Need an equivalent pattern for the React/Next.js stack.

### Decision
Adopt [Preact Signals](https://github.com/preactjs/signals) (`@preact/signals-react`) for form state management. All form components now use signals.

**Migration completed:** All forms (ArtistForm, CategoryForm, ProductForm) have been migrated to signals and the old useState-based implementations have been removed.

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

## ADR-016: Webflow Integration Strategy

**Status:** Accepted
**Date:** 2026-01-20

### Context
Phase 2 of Maple & Spruce focuses on building the public website. Need to integrate admin-managed data (artists, products) with the public-facing Webflow site while giving Katie full design control.

### Decision
Use **CMS Collection Sync** - push data from Firebase to Webflow CMS collections via Cloud Functions. One-way sync (Firebase → Webflow) with Webflow-only presentation fields allowed.

### Rationale
1. **Design Control** - Katie can design artist cards, layouts using native Webflow tools
2. **SEO & Performance** - Content is in Webflow CMS, indexable and fast-loading
3. **Separation of Concerns** - Admin app owns data, Webflow owns presentation
4. **Future Flexibility** - Can add embedded components later for dynamic features

### Alternatives Considered
- **Embedded Components (iframe/custom code)** - Real-time but less design control, SEO issues
- **Two-way sync** - More complex, requires conflict resolution

### Consequences
**Easier:**
- Full design control in Webflow
- SEO-optimized content
- Fast page loads
- Scalable pattern for future content types

**Harder:**
- Sync delay (seconds to minutes) between admin changes and public site
- Additional infrastructure to maintain (sync functions)
- Webflow API rate limits (60/min, 1000/hr)

### Implementation Details
- Authentication: Webflow Site Token stored in Firebase secrets
- SDK: `webflow-api` v3.2.1
- Images: Firebase Storage URLs referenced directly (Webflow caches them)
- Trigger: Firestore document changes fire Cloud Functions

See full details: [ADR-016 Full Document](decisions/ADR-016-webflow-integration-strategy.md)

---

## ADR-017: Cloud Function Unit Testing with Mocked Dependencies

**Status:** Accepted
**Date:** 2026-01-25

### Context
Cloud Functions interact with external services (Square, Firestore) making them seem difficult to test. The original testing plan stated "Repository tests require Firebase mocking complexity" and "mocking Square SDK is complex."

### Decision
Use Vitest's `vi.hoisted()` and `vi.mock()` patterns to mock dependencies at the module level. This enables comprehensive unit testing of Cloud Functions without Firebase emulators or real API calls.

### Implementation
```typescript
// Define mocks using vi.hoisted so they're available in vi.mock factory
const mocks = vi.hoisted(() => ({
  findAll: vi.fn(),
  create: vi.fn(),
}));

// Mock at module level
vi.mock('@maple/firebase/database', () => ({
  ProductRepository: {
    findAll: mocks.findAll,
    create: mocks.create,
  },
}));

// Mock Square SDK similarly
vi.mock('@maple/firebase/square', () => ({
  Square: vi.fn().mockImplementation(() => ({
    catalogService: { listItems: mocks.catalogListItems },
    inventoryService: { getCounts: mocks.inventoryGetCounts },
  })),
}));
```

### Rationale
1. **Not actually complex** - Same pattern used for repository tests works for Square SDK
2. **Fast execution** - No emulators or network calls
3. **Focused testing** - Test business logic in isolation
4. **Already proven** - `auth.utility.spec.ts` and `product.repository.spec.ts` use this pattern

### Test Coverage Achieved
- SyncConflictRepository: 14 tests
- Webhook handler: 10 tests
- Detection logic: 13 tests
- All validation suites: 139+ tests

### Consequences
**Easier:**
- Unit test any Cloud Function logic
- Fast CI runs (no emulator startup)
- Test edge cases and error paths easily

**Harder:**
- Mocks must be maintained when APIs change
- Integration testing still needs emulators (deferred)

---

## ADR-018: Sync Conflict History Preservation

**Status:** Accepted
**Date:** 2026-01-25

### Context
The initial sync conflict implementation would update existing pending conflicts when the same issue was detected again. This loses historical data about when conflicts were first detected and how they evolved.

### Decision
Always create new conflict records. Only check for existing **pending** conflicts to prevent duplicates. Resolved conflicts are preserved as history.

### Behavior
- Detection finds quantity mismatch → Creates new conflict
- Detection runs again, same mismatch exists, conflict still pending → Skip (already pending)
- Admin resolves conflict → Marked as resolved (preserved)
- Detection runs again, mismatch recurs → Creates NEW conflict (history preserved)

### Rationale
1. **Audit trail** - Full history of when conflicts occurred and how resolved
2. **Pattern detection** - Can identify recurring issues with specific products
3. **Simple logic** - Only need to check for pending conflicts, not update state
4. **Expected low volume** - Webhook-based sync handles most updates; conflicts are edge cases

### Consequences
**Easier:**
- Debug recurring sync issues
- Understand resolution patterns over time
- Simple detection logic (create if no pending)

**Harder:**
- Conflict table grows over time (but expected low volume)
- May need pagination for history view (implemented)

---

## ADR-019: Storybook Interaction Testing Patterns

**Status:** Accepted
**Date:** 2026-01-25

### Context
Storybook interaction tests were failing in CI for components that use MUI Dialog (and other portal-based components). The tests couldn't find dialog buttons because:
1. MUI Dialog renders content in a portal at `document.body`, not inside the story's canvas element
2. Using `within(canvasElement)` only queries within the story container, missing portal content
3. DataGrid tables with multiple rows have multiple buttons with the same role/name

### Decision
Adopt these patterns for Storybook interaction tests:

**For portal-based components (Dialog, Modal, Popover, Menu):**
```typescript
import { screen, waitFor } from 'storybook/test';

play: async () => {
  // Wait for portal content to render
  await waitFor(() => {
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  // Query using screen (whole document), not canvas
  const button = screen.getByRole('button', { name: /submit/i });
}
```

**For tables/lists with multiple similar elements:**
```typescript
play: async ({ canvasElement }) => {
  const canvas = within(canvasElement);

  // Use getAllByRole and select specific element
  const buttons = canvas.getAllByRole('button', { name: /resolve/i });
  expect(buttons.length).toBeGreaterThan(0);
  await userEvent.click(buttons[0]); // Click first one
}
```

### Rationale
- `screen` queries the entire document, including portal content
- `waitFor` ensures async portal rendering is complete before querying
- `getAllByRole` handles multiple matching elements gracefully
- These patterns work consistently in both local and CI environments

### Consequences
- Need to import `screen` and `waitFor` from `storybook/test`
- Must choose appropriate query method based on component type
- Tests are more explicit about what they're querying

---

## ADR-020: Payee Interface for Shared Payment Abstractions

**Status:** Accepted
**Date:** 2026-01-25

### Context
Phase 3 introduces Instructors who need to be paid for teaching classes. Artists already have payment-related fields (commission rates, payout tracking). Initially considered two approaches:
1. Add an `isInstructor` flag to Artist
2. Create separate Instructor entity with shared payment interface

### Decision
Use **composition over inheritance** - create a `Payee` interface that both Artist and Instructor implement independently.

```typescript
interface Payee {
  id: string;
  name: string;
  email: string;
  payRate?: number;
  payRateType?: 'hourly' | 'flat' | 'percentage';
}

// Artist implements Payee (for consignment payouts)
interface Artist extends Payee {
  bio?: string;
  imageUrl?: string;
  commissionRate: number; // Artist-specific
}

// Instructor implements Payee (for class payments)
interface Instructor extends Payee {
  bio?: string;
  photoUrl?: string;
  specialties: string[];  // Instructor-specific
}
```

### Rationale
1. **Separation of concerns** - Artists and Instructors have different business contexts
2. **Type safety** - TypeScript discriminated unions prevent mixing up entity types
3. **Flexibility** - A person could be both an Artist AND an Instructor (different records)
4. **Cleaner domain model** - No optional fields or type guards throughout codebase
5. **Independent evolution** - Artist payment logic (commission %) differs from Instructor (hourly/flat rate)

### Alternatives Considered
- **Artist.isInstructor flag** - Would require optional instructor-specific fields, type guards everywhere, and tight coupling
- **Single "Person" entity** - Too generic, loses domain specificity
- **Inheritance (Instructor extends Artist)** - Wrong semantic relationship

### Consequences
**Easier:**
- Clean separation in database (separate collections)
- Type-safe code throughout
- Independent CRUD operations
- Future: shared payout generation from Payee interface

**Harder:**
- If same person is both Artist and Instructor, two records exist (intentional)
- Need to implement Payee-aware utilities separately for each type

---

## ADR-021: Square for All Payments (Supersedes ADR-005)

**Status:** Accepted (supersedes ADR-005)
**Date:** 2026-01-25

### Context
ADR-005 originally chose Stripe for payments. Since then, Square has been integrated as the POS system (ADR-009). Using two payment processors (Stripe for online, Square for in-store) would create:
- Two sets of transaction records to reconcile
- Two sets of webhook handlers to maintain
- Complexity in financial reporting

### Decision
Use **Square for all payments**, including future class registrations. This supersedes ADR-005.

### Rationale
1. **Single source of truth** - All transactions in Square
2. **Unified reporting** - Square Dashboard shows all revenue
3. **Simpler integration** - Already have Square SDK integrated
4. **PCI compliance** - Square handles it for both in-store and online
5. **Cost neutral** - Similar transaction fees (2.9% + 30¢)

### Square Payment Features Used
- **Square Checkout** - For online class registration payments
- **Square Terminal** - For in-store transactions
- **Square Orders API** - Unified order management
- **Square Webhooks** - Already handling inventory; extend to orders

### Consequences
**Easier:**
- One payment processor to manage
- Unified transaction history
- Existing webhook infrastructure reusable
- Simpler financial reconciliation

**Harder:**
- Square Checkout has less customization than Stripe Elements
- Locked into Square ecosystem
- If Square relationship ends, need to migrate everything

### Migration Path
No migration needed - Stripe was never implemented. Simply proceed with Square for Phase 3c (Registration payments).

---

## ADR-022: Catalog-First Class Browsing

**Status:** Accepted
**Date:** 2026-01-25

### Context
Users need to browse and register for classes. Common patterns:
1. **Calendar-first** - View a calendar, click dates to see classes
2. **Catalog-first** - Browse class cards/list, filter by category/date/instructor

### Decision
Use **catalog-first browsing** for the public-facing class discovery experience.

### Rationale
1. **Katie's preference** - Explicitly requested during requirements gathering
2. **Better for discovery** - Users see what's offered without knowing dates
3. **Class types vary** - One-off workshops, multi-session series, recurring classes
4. **Photos matter** - Class photos and descriptions are selling points
5. **SEO-friendly** - Class pages are indexable content

### Implementation
- Public `/classes` page with filter toolbar
- Filters: category, instructor, upcoming/all, skill level
- Class cards show: image, title, instructor, date/time, price, spots available
- Future: Webflow CMS sync for public-facing class pages

### Calendar View (Deferred)
A calendar view could be added later as a secondary navigation option, but is not the primary browsing experience.

### Consequences
**Easier:**
- Rich class presentations with photos and descriptions
- Flexible filtering matches how users think ("pottery classes" not "Tuesday classes")
- Works well for varying class formats

**Harder:**
- Users can't see schedule density at a glance
- Multi-session classes need clear date display
- May need calendar view for power users later

---

## ADR-023: Anonymous Public Registration with Square Web Payments

**Status:** Accepted
**Date:** 2026-02-03

### Context
Phase 3c adds online class registration. Customers need to browse classes and pay to register. Key design questions:
1. Should customers need Firebase Auth accounts to register?
2. How to prevent overbooking (race conditions on capacity)?
3. How to handle the payment flow (redirect vs embedded)?
4. How to support discount codes?

### Decision
Use **anonymous public registration** with embedded Square Web Payments SDK. No Firebase Auth required for customers.

**Registration flow:**
1. Customer browses `/register` (public, no auth)
2. Selects a class, fills in name/email/phone, optionally applies discount code
3. Square Web Payments SDK tokenizes card details (nonce) client-side
4. `createRegistration` Cloud Function (public) receives nonce and processes payment
5. Firestore transaction atomically checks capacity + reserves spot
6. Square `payments.create()` charges the card using the nonce
7. On success: registration confirmed, confirmation email queued
8. On payment failure: registration cancelled, spot freed

**Discount system:** Three types using discriminated unions:
- `percent` - percentage off (e.g., 10%)
- `amount` - fixed dollar amount off (e.g., $5)
- `amount_before_date` - early bird pricing (fixed amount before cutoff date)

### Rationale
1. **No auth barrier** - Requiring account creation reduces conversion for one-time class registrants
2. **Firestore transactions** - Atomic capacity check prevents double-booking race conditions
3. **Embedded card form** - Square Web Payments SDK keeps customers on-site (vs redirect to Square Checkout)
4. **Server-side payment** - Nonce-based flow means card details never touch our server
5. **Email-based identification** - Customers identified by email, no account needed
6. **Discriminated unions for discounts** - Type-safe, extensible, and each variant can have different validation rules

### Alternatives Considered
- **Firebase Auth for customers** - Higher friction, unnecessary for single-purchase flow
- **Square Checkout (redirect)** - Simpler but takes customer off-site, less brand control
- **Stripe Elements** - Would require second payment processor (see ADR-021)
- **Optimistic capacity (no transaction)** - Risk of overselling popular classes

### Consequences
**Easier:**
- Zero-friction registration (no account creation)
- Consistent with Square ecosystem (ADR-021)
- Atomic capacity management prevents overselling
- Extensible discount system for promotions

**Harder:**
- No customer portal (can't view/manage registrations without admin help)
- Email is sole identifier (typos = lost registrations)
- Square Web Payments SDK adds client-side dependency (~50KB)
- Future: may need customer accounts for recurring registrants

---

## ADR-024: Next.js 16 Migration

**Status:** Accepted
**Date:** 2026-02-03

### Context
npm audit flagged high-severity vulnerabilities in Next.js 15.5.x (GHSA-9g9p, GHSA-5f7q, GHSA-h25m). The fixes require Next.js 16.x which is a major version bump.

### Decision
Migrate from Next.js 15.5.11 to 16.1.6 via `nx migrate`. Also added npm `overrides` for `fast-xml-parser: ^5.3.4` to resolve a high-severity vulnerability in the firebase-admin dependency chain.

### Rationale
1. **Security** - Resolves all high-severity npm audit findings
2. **Low risk** - Next.js 16 is a semver-major but the actual breaking changes are minimal for our usage (App Router, client components)
3. **CI compliance** - Security audit step now passes without workarounds

### Consequences
- All high-severity vulnerabilities resolved
- Only 7 low-severity `elliptic` issues remain (no upstream fix available)
- `npm audit --audit-level=high` exits cleanly

---

## Template for New Decisions

```markdown
## ADR-025: Open Web Calendar for Public Calendar Display

**Status:** Accepted
**Date:** 2026-03-23

### Context
The calendar system (Phase 4.5) produces ICS feeds served via Firebase Hosting (`/calendar/classes.ics`, `/calendar/events.ics`, etc.). We need a way to display these feeds as an interactive calendar on the public Webflow marketing site. The admin app (`maple-spruce`) is not the right place for a public-facing calendar page.

### Decision
Use [Open Web Calendar](https://github.com/niccokunzmann/open-web-calendar) — an open-source calendar widget that consumes ICS feed URLs — self-hosted on Vercel. Embed it in Webflow via an iframe in an Embed element.

### Rationale
- **ICS-native:** Directly consumes our existing ICS feed URLs with no intermediary sync step. Feeds are fetched server-side, avoiding CORS issues.
- **Self-hosted on Vercel:** No dependency on a third-party hosted service. We control uptime and can fork if needed.
- **Customizable:** Supports custom CSS, multiple skins, configurable views (month/week/day/agenda), timezone, and per-calendar-source color coding.
- **Free and open source:** GPL-2.0. EU-funded (NLnet/NGI0 Core Fund 2024-2025). No subscription fees.
- **Simple Webflow integration:** Single iframe embed — no custom JavaScript, no build step.

### Alternatives Considered
- **Tockify** ($8/mo): Polished design, but does not support subscribing to arbitrary external ICS feed URLs. Only syncs from Google Calendar.
- **Event Calendar App** ($39/mo): Supports live ICS sync, but expensive for what we need and adds a paid dependency.
- **Elfsight** ($5/mo): Unclear ICS URL support. Free tier limited to ~200 views/month — too restrictive with ads running.
- **Google Calendar embed** (free): Can subscribe to ICS feeds, but refreshes only every 12-24 hours. Generic/dated design, not customizable.
- **FullCalendar in admin app** (free): Maximum flexibility, but hosting a public page inside the admin app is architecturally wrong. Would require maintaining a separate build/deploy for public visitors.

### Consequences
- Calendar display depends on a modestly-sized open-source project (solo maintainer, 315 stars), but self-hosting on Vercel and GPL licensing mitigate abandonment risk.
- Design customization requires CSS work rather than a visual editor.
- Calendar widget lives outside the Nx monorepo (separate Vercel deployment), which is intentional — it's a standalone display layer consuming our ICS API.

---

## ADR-026: Firebase Codebases Split for Cold Start Optimization

**Status:** Accepted
**Date:** 2026-03-24

### Context
All 67 Cloud Functions shared a single Firebase codebase (`maple-functions`) with one auto-generated `package.json`. Every cold start loaded all dependencies — Square SDK (~800KB), Webflow API, ical-generator, timezone data — even for simple CRUD reads that only needed firebase-admin. Cold start times were unnecessarily high for all functions.

### Decision
Split functions into 4 Firebase codebases, each with its own Nx app project, entry point, and auto-generated dependency list:

- **maple-core** (`apps/functions/`): ~52 CRUD/admin functions. No heavy third-party deps.
- **maple-calendar** (`apps/functions-calendar/`): 6 ICS feed functions. Only ical-generator + timezone deps.
- **maple-square** (`apps/functions-square/`): 8 functions. Only Square SDK.
- **maple-sync** (`apps/functions-sync/`): 1 function. Only webflow-api.

Additionally, per-function runtime options (`minInstances`, `concurrency`, `memory`) are configured via `FunctionBuilder.withOptions()`.

### Rationale
- **Nx `generatePackageJson: true`** automatically scopes dependencies per build. Each codebase's `dist/` only includes the packages it actually imports.
- **Firebase codebases** deploy independently — each gets its own Cloud Run service with its own cold start characteristics.
- **CI/CD** uses `function-codebases.json` mapping to determine which codebase to build/deploy when a function library changes.
- **`minInstances: 1`** on public-facing endpoints eliminates cold starts entirely for the most latency-sensitive paths.

### Alternatives Considered
- **Lazy loading via dynamic `import()`**: Would reduce per-function init time but doesn't solve the shared `package.json` problem. All deps still get installed.
- **`thirdParty: true`** (bundle everything including node_modules): Enables tree-shaking but risky with native bindings. Complementary but not sufficient alone.
- **Single codebase with manual package.json**: Error-prone and doesn't leverage Nx's dependency detection.

### Consequences
- Adding a new function now requires choosing the correct codebase and updating `function-codebases.json` (if not maple-core).
- CI/CD builds only affected codebases rather than all functions.
- First deploy after the split requires manually deleting the old function names from the previous `maple-functions` codebase.
- `minInstances: 1` adds a small ongoing cost (~$0.11/day per 512MB warm instance).

---

## ADR-027: Integration Testing with Firebase Emulators

**Status:** Accepted
**Date:** 2026-03-30

### Context
Unit tests mock repositories and external services (ADR-017), which validates business logic in isolation but misses integration issues. We discovered two bugs that only manifest when functions run against real Firebase services: `preferRest: true` breaks Firestore in the emulator (REST transport tries OAuth), and a blanket `path-to-regexp` override prevents Express 4 from starting in the functions emulator. These classes of bugs cannot be caught by mocked unit tests.

### Decision
Create a dedicated Nx app (`apps/functions-integration-tests/`) that tests Cloud Functions against the Firebase local emulator suite (auth, firestore, functions). Tests use Vitest with `globals: true`, run sequentially against shared emulator state, and are excluded from the root `vitest run` used for unit tests. CI runs them in a separate job with Java 21 (required by the Firestore emulator).

### Rationale
- Catches config and integration bugs that mocked tests miss
- Emulator REST APIs provide clean setup/teardown without SDK dependencies
- Separate Nx app keeps integration tests isolated from fast unit test feedback loop
- Modeled after the Mountain Sol platform's proven integration test setup

### Alternatives Considered
- **Unit tests only**: Faster but missed real integration bugs (preferRest, path-to-regexp)
- **E2E tests on staging**: Slower, costs money, flaky due to network
- **Firebase Test SDK (`@firebase/rules-unit-testing`)**: Only tests security rules, not Cloud Function logic

### Consequences
- CI pipeline gains an additional job (~1-2 min with emulator startup)
- Developers need Java installed locally to run integration tests
- New test fixtures must be maintained alongside domain type changes
- `firebase.json` now configures auth (9099) and firestore (8080) emulator ports

---

## ADR-028: Plain RBAC with Firestore Role Docs (not custom claims, ABAC, or ReBAC)

**Status:** Accepted
**Date:** 2026-07-16

### Context
The portal needs scoped access for more kinds of staff: Stephanie manages only Music Together, Nathan is a clerk (store/POS/registrations) *and* a lesson teacher, and future lesson teachers should read all lessons but mutate only their own. Access was binary admin (`admins/{uid}` doc existence). Researched RBAC vs ABAC vs ReBAC/Zanzibar (OpenFGA, SpiceDB) vs policy libraries (Cedar, Casbin) vs SaaS authz, and Firestore role docs vs Firebase custom claims, grounded in this codebase (epic #617).

### Decision
Plain RBAC: a `Role` enum (`admin`, `mt-teacher`, `clerk`, `lesson-teacher`), a `userRoles/{uid}` Firestore doc holding a roles array (multi-role, any-of checks via `requiringRole([...])`), with `admins/{uid}` remaining authoritative for admin. The one record-level rule — lesson teachers mutate only their own lessons — is an ownership predicate (`assertOwnerOrAdmin`-style helper) layered on the role gate, not a new authorization model. Client role state comes from a single `getMyRoles` callable via `RolesProvider`; nav filtering is UX only, enforcement is server-side per function.

### Rationale
- ~4 stable roles mapping 1:1 to job functions, <10 users, single tenant: the textbook RBAC profile
- One enforcement point (the callable FunctionBuilder) — the roles check lands in one file and is trivially testable
- **Custom claims' main benefit is moot here**: the client has zero direct Firestore reads (all data flows through callables; `firestore.rules` is deny-all), so there is no rules integration to gain. The doc gives instant revocation (claims lag up to ~1h on token TTL), console visibility, and is cost-neutral (the per-invocation `admins/{uid}` read already existed)
- An ownership check is one foreign-key comparison; a relationship store (ReBAC) or policy DSL (ABAC/Cedar) to express one `if` is pure overhead

### Alternatives Considered
- **Firebase custom claims**: zero-read checks, but stale up to a token refresh, invisible in the console, and needs sync plumbing; its rules-integration advantage doesn't apply to this architecture
- **ReBAC / Zanzibar (OpenFGA, SpiceDB)**: built for per-object sharing graphs; requires a sidecar service and tuple sync — operational cost far exceeds benefit at this scale
- **ABAC / policy libraries (Cedar, Casbin, Oso)**: no context/time/tenant conditions exist to express; adds a second language to review
- **SaaS authz (Permit.io, AWS Verified Permissions)**: external dependency + latency in the hot path of cold-start-sensitive callables

### Consequences
- Scoping a function to roles is a one-line `requiringRole([...])` change (#615)
- Phase-2 lesson ownership needs a teacher↔uid link on the instructor record (#616)
- A CI analyzer should assert every exported callable declares a role or sits on an explicit public allowlist (#620)
- Revisit if: >8–10 roles / one-off permission combos (→ policy library), per-resource grants or customer-scoped logins (→ ReBAC), multi-tenancy, or the client regains direct Firestore reads (→ reopen custom claims)

---

## ADR-029: Domain Routers — One HTTP Function per (Domain × Codebase), not per Endpoint

**Status:** Accepted
**Date:** 2026-08-02

### Context
We deploy **215 single-purpose functions** (`libs/firebase/maple-functions/*`), nearly all CRUD
endpoints: `getClasses`, `createClass`, `updateClass`, `deleteClass`, `getDiscounts`, … Each is a
separate Cloud Run service with its own revision, health check, deploy write op, and CPU burst.

`deploy_functions_dev` has been failing repeatedly (`Container Healthcheck failed. Quota exceeded
for total allowable CPU per project per region`, under a storm of 429s). Two quota facts, from
[Cloud Run functions quotas](https://docs.cloud.google.com/functions/quotas):

- The gen-2 API **WRITE quota is 60 per 60 seconds and cannot be increased**. At 215 functions a
  full deploy needs ≥4 minutes of pure API writes, permanently.
- "Total CPU allocation" is a **per-minute rate** ("total sum of user-requested CPU across function
  instances over a 1 minute period"), not a standing reservation — which is why the console reads
  ~0.5% at idle while a wide deploy still fails.

Google's own first remedy is *"reduce deployment velocity"*, and it names CI systems deploying many
functions at once as the cause. PR #725 batches the deploy, but that is a mitigation whose cost
grows linearly with function count. Community datapoints put the pain threshold at
[~60 functions, with 150+ taking ~45 minutes to deploy](https://groups.google.com/g/firebase-talk/c/Ym14sCZXHMA);
the [Upcover writeup](https://blog.haroldadmin.com/posts/selective-redeployments-cloud-functions)
hit CLI rate limits at ~60 and had to build batching plus per-function hashing to cope.

Two repo-specific findings materially change the cost/benefit here:

1. **We are already plain HTTP, not `onCall`.** `Functions.endpoint.handle()`
   (`libs/firebase/functions/src/lib/functions.utility.ts`) builds an `onRequest` function and
   hand-rolls CORS, Bearer-token verification, the role gate, Vest validation, uniqueness checks,
   the warmup sentinel, and the `{ data: … }` request/response envelope that makes the client's
   `httpsCallable` work. Consolidation is therefore a **routing** change, not a protocol change —
   the middleware chain already exists and is ours.
2. **The cold-start objection is already paid.** `apps/functions/src/index.ts` top-level re-exports
   all ~165 core functions, so every maple-core container already evaluates every core function
   module at cold start. This is the known Firebase failure mode — [when all functions share a
   single index, every cold start loads every function's dependencies](https://github.com/hursey013/better-firebase-functions).
   Grouping endpoints into a router does not add bundle weight we aren't already carrying.

### Decision
Group endpoints into **domain routers**: one `onRequest` function per (domain × codebase), with an
Express `Router` dispatching to the existing handlers. Firebase explicitly supports this — the
HTTPS function interface accepts `(req, res) => void`, which `express.Router`/`Application`
satisfy, and [Firebase Hosting's docs](https://firebase.google.com/docs/hosting/functions) note
that with Express routing "the function name is added as a prefix to the URL paths in the app you
define."

The existing `FunctionBuilder` chain (auth → role → validation → uniqueness → warmup → envelope)
becomes **per-route router middleware**, unchanged in semantics. Clients migrate from
`httpsCallable(functions, 'name')` to `httpsCallableFromURL(functions, '<routerUrl>/<route>')`,
which preserves the callable envelope and ergonomics.

Target: **215 → ~25 functions.**

**Routers are per (domain × codebase), not per domain.** A codebase is a separate deployable, and
our domains cut across them — Music Together spans all four (core 25, square 4, calendar 2, sync 2),
Craft Club straddles core and square. A "one router per domain" plan cannot work as stated without
first revisiting the codebase split (ADR-026).

### Rationale
- Attacks the actual cause. Batching (#725) makes a 215-function deploy survivable; it cannot make
  it fast, because the 60/60s write quota is a hard floor that scales with function count.
- Cheap in this codebase specifically: the middleware exists, the wire format is already
  `{ data: … }`, and the container already loads the whole codebase.
- **gen-2 concurrency makes fewer, hotter functions better for cold starts, not worse.** With
  `concurrency: 80`, one instance serves many requests; consolidating raises per-function traffic
  and lowers the cold-start hit rate. The v1 intuition ("one instance per request, so keep
  functions small") does not apply.
- Restores an optimization we currently forfeit: firebase-tools' skip-unchanged deploy is gated on
  `!want[id].targetedByOnly` (`release/planner.js`), and *any* `--only` filter — including a bare
  codebase filter — marks every endpoint targeted. Fewer functions means fewer targets regardless.
- Domain-sized routers are the middle of the
  [lambdalith-vs-single-focus](https://urielbitton.substack.com/p/lambdaliths-vs-lambda-single-focus)
  spectrum: they capture the deploy/ops win without the "one crash takes down everything" and
  "everything scales together" failure modes of a single app-wide function.

### Alternatives Considered
- **Raise the quotas.** The write quota is explicitly not increasable, and the CPU quota is a rate
  we breach only during deploys. Worth taking the free CPU bump as a stopgap; it is not a fix.
- **Batching alone (#725).** Shipped, and necessary regardless — but its cost grows linearly and it
  leaves a ≥4-minute write-quota floor in place.
- **A single `{ action, payload }` dispatcher per codebase (4 functions).** Maximal deploy win, but
  every endpoint shares one URL, one log stream, one IAM identity, and one blast radius; every
  change redeploys everything. Too coarse — loses the observability and isolation that make
  incidents debuggable.
- **Lazy exports (`better-firebase-functions` style).** Fixes cold-start module loading, not
  function count or deploy time. Complementary; worth doing separately, not a substitute.
- **Move to Cloud Run services directly.** Larger migration, and we would rebuild the
  auth/validation/secrets ergonomics `FunctionBuilder` already gives us.
- **Do nothing.** Function count only grows with the roadmap; every new endpoint makes the deploy
  slower and the quota breach more likely.

### Consequences
- Deploy write ops drop ~215 → ~25, taking a full deploy under the 60/60s quota in a single batch.
- **Blast radius widens to the domain.** An unhandled crash takes down the instance serving that
  domain's routes, where today it takes down one endpoint. Domain-sized boundaries bound this;
  route handlers must not throw past the middleware's error envelope.
- **Runtime options become per-router.** `memory`, `timeoutSeconds`, `minInstances`, and `secrets`
  are properties of the function, so co-located routes share them. A route needing materially
  different limits stays its own function — that is the documented escape hatch, not a failure.
- Per-route observability must be added deliberately (a route label in logs), since the function
  name no longer identifies the endpoint.
- Client call sites (`libs/react/data/`, the Webflow registration widget) migrate to
  `httpsCallableFromURL`. Old functions stay live until their call sites move.
- Retired functions must be deleted manually (`firebase functions:delete`) — CI does not prune.
- A CI ratchet (`tools/check-function-count.ts`) prevents the count from growing while this is
  in progress.
- Revisit if: a domain's routes diverge sharply in memory/timeout/secret needs, or a router's
  route count makes its cold start measurably worse than the per-endpoint baseline.

---

## ADR-030: Vanity Subdomain Redirects via `vercel.json`, not DNS or Webflow

**Status:** Accepted
**Date:** 2026-08-02

### Context
Marketing wants short, speakable subdomains that land on deep pages of the Webflow site — the
first being `mt.mapleandsprucefolkarts.com` → `/music-together`. These go in Instagram bios, on
printed cards, in QR codes, and as Meta ad destinations, so they must work over **HTTPS** and must
**preserve `?utm_*` query strings** for lead attribution (see `tallyLeadWebhook`, PR #429).

DNS is on Namecheap BasicDNS. The apex and `www` point at Webflow; `business.` already CNAMEs to
Vercel; mail is Google Workspace.

### Decision
Add a host-scoped 301 to the root `vercel.json` on the existing `maple-and-spruce-maple-spruce`
Vercel project, and CNAME the subdomain at Namecheap to that project.

```json
{
  "source": "/((?!\\.well-known).*)",
  "has": [{ "type": "host", "value": "mt.mapleandsprucefolkarts.com" }],
  "destination": "https://mapleandsprucefolkarts.com/music-together",
  "statusCode": 301
}
```

`vercel.json` redirects resolve in Vercel's edge routing phase, **before** the filesystem, the
Next.js app, and any middleware — so the vanity host never touches admin-app code.

### Rationale
- DNS stays at Namecheap; only one CNAME is added per vanity host.
- Free auto-renewing TLS, and Vercel forwards the source query string onto the destination.
- Reuses the Namecheap→Vercel CNAME pattern already proven by `business.`.
- `statusCode: 301` rather than `permanent: true` — Vercel maps `permanent` to a **308**. Google
  treats them alike, but link scrapers and SEO tools handle 301 more predictably, and these are
  marketing links.
- `(?!\.well-known)` keeps ACME challenge paths out of the catch-all so cert issuance and renewal
  are unaffected.
- Scoping with `has: host` means the rule is inert on every other domain on the project, so more
  vanity hosts can be added as sibling entries without colliding.

### Alternatives Considered
- **Namecheap URL Redirect Record.** Two minutes of work, but the service serves no TLS on the
  source host — `https://mt.…` fails with a certificate error, breaking every link written as
  `https://`. It also drops query strings, which silently breaks ad attribution.
- **An extra custom domain on Webflow.** Does not work: subdomains are *exempt* from Webflow's
  default-domain 301 ("Subdomains are not affected by default domains"), so `mt.…` would serve a
  full duplicate copy of the site rather than redirecting. Webflow's own 301 rules are path-only
  and cannot be scoped to a hostname, so the only rule that would reach `/music-together` is
  `/` → `/music-together`, which would break the real homepage.
- **Cloudflare Redirect Rules.** Works well and is the usual recommendation, but requires moving
  nameservers off Namecheap and recreating every record — including Google Workspace MX and the
  SPF/DKIM/DMARC TXTs. Too much blast radius for one vanity link.
- **A separate single-purpose Vercel project.** Isolates the link from admin-app deploys, but needs
  a second project plus its own deploy path. The isolation argument is weaker than it looks: a
  later failed deploy does not take the redirect down, because the last good production deployment
  keeps serving it. Not worth the extra moving part.

### Consequences
- Adding a vanity host is now: one `redirects` entry, one `vercel domains add`, one Namecheap CNAME.
- The rule ships on the admin app's deploy cadence, so a *change* to a vanity redirect waits for a
  successful `deploy_vercel_prod`. Existing redirects keep serving from the last good deployment.
- **Order matters when adding a host:** deploy the redirect rule *before* pointing DNS at Vercel.
  A hostname that resolves to the project without a matching rule serves the admin app instead.
- Webflow remains unaware of these hostnames — they must never be added as Webflow custom domains,
  or the duplicate-content problem above reappears.

---

## ADR-031: A Dedicated `maple-webhooks` Codebase for Timeout-Bound Third-Party Callers

**Status:** Accepted
**Date:** 2026-08-07

### Context
Tally emailed five "Webhooks integration needs attention" reports between 2026-07-30 and
2026-08-06, one per day the newsletter form got a signup, all reading
`timeout of 10000ms exceeded`.

`tallyLeadWebhook` was healthy. Probing prod directly with invalid-signature requests — which
return 401 before a single line of handler logic runs — isolated the cause as cold start, and
showed it is a property of the **codebase**, not the function:

| Codebase | Bundle | Cold | Warm |
|----------|--------|------|------|
| `maple-core` | 488kb | 14.4s | 1.0s |
| `maple-sync` | 301kb | 6.3s | 1.3s |
| `maple-calendar` | 30kb | 3.2s | 1.1s |

A Firebase codebase is one bundle, and every function in it loads the whole entry point on boot,
so a trivial function inherits the boot cost of its 165 heaviest siblings (`checkAdminStatus`
measured 14.8s cold, matching `tallyLeadWebhook`).

Two properties made this silent and total rather than intermittent:

1. The form draws roughly **one signup a day**, so the Cloud Run service was cold for essentially
   every real delivery. This was not a tail-latency problem; it was the common case.
2. **Tally does not retry.** Square's 10s timeout produces a retry storm that eventually succeeds
   (the 2026-05 504 incident); Tally's produces a permanently lost lead that must be resent by
   hand from the events log.

### Decision
Add a fifth Firebase codebase, `maple-webhooks` (`apps/functions-webhooks/`), for endpoints called
by external platforms on a fixed delivery budget, and move `tallyLeadWebhook` into it. Keep its
dependency surface to firebase-functions + crypto + vest — the resulting bundle is 90kb.

Separately, bound every outbound call on such a path with `AbortSignal.timeout(...)`; `fetch` has
no default timeout, so a hung upstream can blow a 10s budget even from a warm instance.

### Rationale
Cold start is the only lever that actually moves here, and bundle size is the only lever on cold
start. Isolation buys ~14.4s → low single digits, with margin against Tally's cutoff and no
recurring cost. It also gives future timeout-bound integrations a correct default home instead of
landing in `maple-core` and quietly inheriting a 14s boot.

### Alternatives Considered
- **`minInstances: 1` on the function** — keeps it warm (~1s) but pays for an idle instance 24/7 to
  serve about one request a day, and every reserved instance counts against the regional
  Total-CPU quota that already constrains deploys (see `global-runtime-options.ts`).
  Rejected as expensive and quota-hostile for a once-daily endpoint.
- **Move it to `maple-calendar` (3.2s) or `maple-sync` (6.3s)** — a three-line change and both fit
  under 10s. Rejected: `maple-sync`'s margin is thin and shrinks as that codebase grows, and
  neither is a defensible home for a lead webhook. The naming lie would outlive the fix.
- **Ack fast and defer the beacons to a Firestore-triggered worker** (the `squareWebhook` →
  `processCatalogSyncRequest` pattern). Rejected: it addresses handler duration, and the timeout
  here happens *before the handler runs*. It would not have saved a single one of the five leads.
- **Shrink `maple-core` itself** — the right long-term fix for the admin portal's latency too, but
  it's an open-ended project and this was actively dropping leads.

### Consequences
- Five codebases now. Adding one touches `firebase.json`, `function-codebases.json`, the artifact
  paths and affected-regex in `firebase-functions-merge.yml`, the build/env blocks in
  `build-check.yml` and `tools/run-integration-tests.sh`, plus the hardcoded lists in
  `validate-function-tsconfigs.sh` and `check-callable-roles.ts`. Deploys serialize per codebase,
  so this adds one more sequential unit to a full redeploy.
- **`maple-webhooks` only works while it stays small.** A function that pulls firebase-admin
  repositories, the Square SDK, or webflow-api re-inflates the bundle and reintroduces the outage
  for everything else in it. That constraint is documented at the entry point and in
  `.claude/rules/firebase-functions.md`; if a new webhook is heavier, it gets its own codebase.
- `squareWebhook` has the same 10s budget. **Correction (2026-08-07):** the first draft of this
  ADR said it was in `maple-core` — it was actually in `maple-square` (419kb), which measured
  7.5-12.0s cold. Same class of problem, different bundle; it was given its own
  `maple-square-webhook` codebase in the follow-up (see ADR-032).
- The five already-failed submissions are not recovered by this change; they must be resent from
  Tally's events log after deploy. Verified 2026-08-07: all five leads (`drock865@gmail.com`,
  `christinepill@yahoo.com`, `a.umbel@protonmail.com`, `danielle.bradke@gmail.com`,
  `paperruth@gmail.com`) **are** active subscribers in MailerLite, so no signups were lost —
  Tally's MailerLite integration delivers independently of the webhook. Only the GA4
  `generate_lead` and Meta `Lead` attribution events were dropped.

---

## ADR-032: `squareWebhook` Gets Its Own Codebase, Separate From `maple-webhooks`

**Status:** Accepted
**Date:** 2026-08-07

### Context
ADR-031 isolated `tallyLeadWebhook` after Tally dropped five leads to 10s delivery timeouts.
`squareWebhook` runs against the same 10s ceiling (Square records `http_timeout`, shown as 504 in
the dashboard, then retries with backoff for up to 24h — the 2026-05 storm).

It was **not** in `maple-core`, as ADR-031's first draft claimed; it was in `maple-square` (419kb).
Measured cold on 2026-08-07 with invalid-signature probes:

| Function | Codebase | Bundle | Cold |
|----------|----------|--------|------|
| `squareWebhook` | `maple-square` | 419kb | 7.5s |
| `syncInventoryToSquare` | `maple-square` | 419kb | 12.0s |

Two functions, one bundle, a 4.5s spread — **cold start is a distribution, not a number**;
placement and image-cache state dominate. 7.5s of boot leaves ~2.5s for a handler whose inventory
path does a full `ProductRepository.findAll()` plus per-product writes. The 12.0s sample is over
budget before the handler starts at all.

### Decision
Give `squareWebhook` its own codebase, `maple-square-webhook` (`apps/functions-square-webhook/`),
at 141kb. Leave `processCatalogSyncRequest` and `processPosSale` in `maple-square` — they are
Firestore-triggered workers, so their cold start is not on any deadline Square is waiting on.

### Rationale
Same lever as ADR-031, and the only one that moves: bundle size is what shifts the cold-start
distribution. 419kb → 141kb buys real margin against a ceiling we do not control.

### Alternatives Considered
- **Put it in `maple-webhooks` alongside `tallyLeadWebhook`** — one fewer codebase, and the merged
  bundle (~145kb) would still be under 10s for both. Rejected: `squareWebhook` needs
  `@maple/firebase/database`, so this spends `tallyLeadWebhook`'s margin on a function that has
  Square's retries as a safety net, while Tally has none. Asymmetric risk, so keep them apart —
  exactly the rule ADR-031 wrote down.
- **Ack fast, defer everything to Firestore workers** — the pattern already used for catalog sync
  and POS sales. Still the right end state for the inline inventory/invoice/subscription paths,
  but it doesn't help the failure mode that actually bites (timeout *before the handler runs*),
  and it changes retry semantics on payment-adjacent code. Not worth bundling into this move.
- **`minInstances: 1`** — rejected for the same quota and cost reasons as ADR-031.

### Consequences
- Six codebases. The per-codebase wiring cost from ADR-031 applies again, and a full redeploy gains
  one more sequential unit.
- The webhook URL is unchanged — `FirebaseProject.functionUrl()` is
  `{base}/{functionName}`, independent of codebase — so Square's registered notification URL and
  the HMAC signature (computed over that URL) keep working. **No Square dashboard change needed.**
- `maple-square` keeps the Square SDK and the workers; only the receiver moved.
- Moving a function between codebases relabels it in place. Watch the first deploy: if
  firebase-tools declines to adopt the function under the new codebase, the fallback is
  `firebase functions:delete squareWebhook` followed by a redeploy — which would drop webhook
  deliveries in the gap, so it must be done deliberately, not as a reflex.

---

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

*Last updated: 2026-08-02 (ADR-030 added for vanity subdomain redirects via vercel.json)*
