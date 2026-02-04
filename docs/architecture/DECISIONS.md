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

*Last updated: 2026-01-25 (ADRs 020-022 added for Phase 3)*
