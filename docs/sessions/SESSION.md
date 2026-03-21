# Session Context

> **DIRECTIVE**: Keep this file updated with current work status. Archive completed sessions to `history/YYYY-MM-DD.md`.

---

## Current Status

**Date**: 2026-03-21
<<<<<<< HEAD
**Status**: Webflow site live, phased customer interaction integration underway
=======
**Status**: 🔧 Calendar System In Progress
>>>>>>> origin/main

### Current Focus: Phased Webflow Customer Interactions

<<<<<<< HEAD
The Webflow site is live and published. Facebook/Instagram ads are running. The focus has shifted to phased integration of customer-facing interactions on the Webflow site.
=======
**Calendar Domain + Admin CRUD (Phase 4.5, PR 1 of 3)**
- PR #160: `feat/157-calendar-domain-and-admin-crud`
- CalendarEvent domain type with RFC 5545 RRULE recurrence support
- Vest validation suite (30+ tests, all passing)
- CalendarEventRepository (Firestore `calendarEvents` collection)
- 5 CRUD Cloud Functions (get/create/update/delete calendar events)
- `useCalendarEvents` data hook
- `libs/react/events/` component library (List, Form, FilterToolbar)
- Admin `/events` page with full CRUD
- "Calendar Events" nav item in AppShell sidebar

### Next Steps (Calendar System)

1. **PR 2** (#158): ICS feeds + `onClassWrite` trigger
   - `ical-generator` library, 5 HTTP feed endpoints, adhoc proxy
   - Firestore trigger to auto-generate CalendarEvents from published classes
   - Firebase Hosting rewrites for clean URLs
2. **PR 3** (#159): Public `/calendar` page
   - FullCalendar integration, color-coded event sources
   - Month/week/list views, mobile responsive, click-through to registration

### GitHub Issues

- Epic: #156 (Public Calendar System)
- #157 (Domain + Admin CRUD) — PR #160 filed
- #158 (ICS Feeds + Trigger) — planned
- #159 (Public Calendar Page) — planned

---

### Previous: Webflow Content Update (2026-03-17)

**Webflow Website Content Update (Phases 1-4)**
>>>>>>> origin/main

**Phase sequence:**
1. **Epic A: Artists on Webflow** ([#161](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/161)) — Not Started
2. **Epic B: Class Browsing on Webflow** ([#162](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/162)) — Not Started
3. **Epic C: Payment & Registration Testing** ([#163](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/163)) — Not Started
4. **Epic D: Class Registration with Payment** ([#164](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/164)) — Not Started

**Key decisions:**
- Test against dev CMS collections before production
- No payment integration until backend testing is complete
- Music lessons use Tally forms for initial inquiries ([#10](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/10) updated)

### Recently Completed

**Webflow Go-Live** (closed issues: #112, #126, #127, #129, #131, #132, #135, #137)
- Site published and live with ads running
- Content updates, navigation fixes, new pages (Music Lessons, Classes, Shop)
- Pre-opening banner on all pages
- SEO metadata on new pages

**Phase 3 (Complete)**
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

1. Begin Epic A: Artists on Webflow (#161)
2. Fix Artists page 404 (#114) + add real artist profiles
3. Post-launch quality improvements (#114-#122)
4. Phase 4 - Music Lessons backend (Tally forms for initial inquiries)

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

*Last updated: 2026-03-21*
