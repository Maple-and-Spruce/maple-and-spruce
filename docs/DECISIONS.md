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

*Last updated: 2025-01-06*
