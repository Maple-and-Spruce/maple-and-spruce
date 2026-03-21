# Session Context

> **DIRECTIVE**: Keep this file updated with current work status. Archive completed sessions to `history/YYYY-MM-DD.md`.

---

## Current Status

**Date**: 2026-03-17
**Status**: ✅ Webflow Content Update Complete

### Just Completed

**Webflow Website Content Update (Phases 1-4)**

Phase 1 — Fixed existing pages:
- Fixed Craft Club typo ("not though" → "not through")
- Removed specific jam times from Music + Contact FAQ (no set time yet)
- Updated Our Story ("soft opening mid-2026" → "Opening May 2026")
- Removed "open hours" reference from Fiddle Repair
- Updated Contact page with opening date + phone number
- Fixed 5 broken navigation links in maple-nav component (Artists, Our Story, Gallery, Contact all had wrong URLs)

Phase 2 — Created 3 new pages:
- `/music-lessons` — Suzuki violin, Suzuki harp, old-time fiddle, guitar (coming soon), instrument loan program, lesson policies
- `/classes` — 6 class offerings (wire wrapping, beading, stained glass intro + series, pottery, micro macrame), pathway, policies
- `/shop` — What we carry, Etsy link, in-store (opening May), consignment info
- All pricing verified against workspace docs (`_business_context/02-products-and-services.md`)

Phase 3 — Updated navigation:
- Added Music Lessons link to Music dropdown
- Added Shop link to Craft dropdown
- Fixed all broken nav hrefs

Phase 4 — Pre-opening banner (in maple-nav component):
- Added "Opening May 2026" banner inside the `maple-nav` component (appears on all pages)
- Generic text: "Opening May 2026 — Classes are coming soon!"
- "Contact us for more info →" links to the Contact page
- Created `pre-opening-banner` reusable style (lime green `#E0EF7D`)
- Old per-page banners manually cleaned up

Documentation updated:
- `docs/reference/implementation-status.md` — 9 items marked complete in Webflow Go-Live section
- `docs/reference/webflow-go-live-checklist.md` — 12 items marked done, page count updated
- SEO metadata set on all 3 new pages (titles, descriptions, OG tags)

### Phase 3 Summary (Complete)

- **Phase 3a: Backend** - Domain types, validation, repositories, 13 Cloud Functions
- **Phase 3b: Admin UI** - Instructor and Class management pages with Storybook
- **Phase 3c: Registration** - Discount system, registration with Square payments, public checkout flow

### Key Design Decisions Made

1. **ADR-020**: Payee Interface Pattern (composition over inheritance)
2. **ADR-021**: Square for All Payments (supersedes Stripe)
3. **ADR-022**: Catalog-First Class Browsing
4. **ADR-023**: Anonymous Public Registration with Square Web Payments
5. **ADR-024**: Next.js 16 Migration for security

### Next Steps

1. Publish Webflow site (review all pages first)
2. Fix Artists page 404 (#114) + add real artist profiles
3. Delete orphan `/untitled` page in Webflow
4. Responsive QA on new pages (#121)
5. Phase 4 - Music Lessons backend (domain types, student management, scheduling)

### Environment Variables Needed for Registration

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SQUARE_APPLICATION_ID` | Square app ID for Web Payments SDK |
| `NEXT_PUBLIC_SQUARE_LOCATION_ID` | Square location for Web Payments SDK |

### Blockers
- None currently

---

## Quick Reference

### Environments
| Environment | Web App | Firebase Project | Square |
|-------------|---------|------------------|--------|
| Production | business.mapleandsprucefolkarts.com | `maple-and-spruce` | Production API |
| Development | business-dev.mapleandsprucefolkarts.com | `maple-and-spruce-dev` | Sandbox API |

### Phase 3 Components

| Library | Components |
|---------|------------|
| `libs/react/instructors/` | InstructorList, InstructorForm, InstructorFilterToolbar |
| `libs/react/classes/` | ClassList, ClassForm, ClassFilterToolbar |
| `libs/react/discounts/` | DiscountList, DiscountForm |
| `libs/react/registrations/` | RegistrationList, RegistrationDetailDialog, PublicClassCard, RegistrationCheckoutForm, CostSummary, SquareCardForm |

### Cloud Functions (Phase 3)

**Instructor:** getInstructors, getInstructor, createInstructor, updateInstructor, deleteInstructor

**Class:** getClasses, getClass, createClass, updateClass, deleteClass, uploadClassImage, getPublicClasses, getPublicClass

**ClassCategory:** getClassCategories

**Discounts:** getDiscounts, createDiscount, updateDiscount, deleteDiscount, lookupDiscount

**Registrations:** getRegistrations, getRegistration, updateRegistration, calculateRegistrationCost, createRegistration, cancelRegistration

### Test Commands
```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific library
npx nx run validation:test
npx nx run domain:test
```

### Storybook Commands
```bash
# Run Storybook locally
npx nx run maple-spruce:storybook

# Build Storybook
npx nx run maple-spruce:build-storybook
```

### Local Development
```bash
# Run functions locally
npx nx run functions:serve

# Run web app locally
npx nx run maple-spruce:serve
```

### Deployment
**Let CI/CD handle deployments** - don't run manual `firebase deploy` commands.

Functions deploy automatically when PRs merge to main via `.github/workflows/firebase-functions-merge.yml`.

---

## Session History

See `history/` folder for detailed session logs:
- [2026-02-03](history/2026-02-03.md) - Phase 3c: Registration system, security fixes, Next.js 16
- [2026-01-25](history/2026-01-25.md) - Sync conflict resolution, Storybook test fixes, Phase 3a/3b
- [2026-01-20](history/2026-01-20.md) - Webflow CMS sync, dev/prod separation
- [2026-01-19](history/2026-01-19.md) - Dev environment fixes, product/artist integration
- [2026-01-18](history/2026-01-18.md) - Square integration foundation, dev/prod separation

---

*Last updated: 2026-03-17*
