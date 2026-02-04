# Session Context

> **DIRECTIVE**: Keep this file updated with current work status. Archive completed sessions to `history/YYYY-MM-DD.md`.

---

## Current Status

**Date**: 2026-02-03
**Status**: ✅ Phase 3 Complete - Ready for Phase 4 (Music Lessons)

### Just Completed

**PR #108 Merged: Phase 3c - Registration System with Square Payments**
- 13 new Cloud Functions (6 discount, 5 registration, createRegistration, cancelRegistration)
- Square PaymentsService for payment processing and refunds
- Admin UI: `/discounts` (full CRUD), `/registrations` (list + detail + cancel/refund)
- Public registration flow: `/register` → `/register/[classId]` → `/register/[classId]/confirm`
- Square Web Payments SDK integration for secure card entry
- Discount system (percent, amount, early-bird) with validation
- Firestore transactions for atomic capacity checking
- Next.js 16 migration + security vulnerability resolution

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

### Next Steps: Phase 4 - Music Lessons

1. Music lesson domain types (instrument, level, schedule)
2. Student management
3. Recurring lesson scheduling
4. Suzuki method curriculum tracking

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

*Last updated: 2026-02-03*
