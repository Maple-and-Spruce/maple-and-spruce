# Session Context

> **DIRECTIVE**: Keep this file updated with current work status. Archive completed sessions to `history/YYYY-MM-DD.md`.

---

## Current Status

**Date**: 2026-03-22
**Status**: Calendar system complete, Webflow customer interaction phasing underway

### Current Focus: Phased Webflow Customer Interactions

The Webflow site is live and published. Facebook/Instagram ads are running. The focus has shifted to phased integration of customer-facing interactions on the Webflow site.

**Phase sequence:**
1. **Epic A: Artists on Webflow** ([#161](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/161)) — Not Started
2. **Epic B: Class Browsing on Webflow** ([#162](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/162)) — Not Started
3. **Epic C: Payment & Registration Testing** ([#163](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/163)) — Not Started
4. **Epic D: Class Registration with Payment** ([#164](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/164)) — Not Started

**Key decisions:**
- Test against dev CMS collections before production
- No payment integration until backend testing is complete
- Music lessons use Tally forms for initial inquiries (#10 updated)

### Recently Completed: Calendar System (Phase 4.5, All 3 PRs Merged)

- **PR #160** (#157): CalendarEvent domain, CRUD functions, admin UI
- **PR #166** (#158): ICS feeds, onClassWrite trigger, hosting rewrites
- **PR 3** (#159): Public `/calendar` page with FullCalendar
  - FullCalendar integration with color-coded ICS event sources
  - Month/week/list views, mobile-responsive (list default on mobile)
  - Store hours as background events
  - Event click-through to `/register/{classId}` via sourceRef
  - Calendar legend and subscribe section with copyable ICS URLs

### Recently Completed: Webflow Go-Live

Closed issues: #112, #126, #127, #129, #131, #132, #135, #137

### Next Steps

1. Begin Epic A: Artists on Webflow (#161)
2. Fix Artists page 404 (#114) + add real artist profiles
3. Post-launch quality improvements (#114-#122)
4. Phase 4 - Music Lessons backend (Tally forms for initial inquiries)

### GitHub Issues

**Webflow Customer Interactions:**
- #161 (Artists on Webflow) — not started
- #162 (Class Browsing on Webflow) — not started
- #163 (Payment & Registration Testing) — not started
- #164 (Class Registration with Payment) — not started

**Calendar System (Complete):**
- Epic: #156 (Public Calendar System)
- #157 (Domain + Admin CRUD) — Merged (PR #160)
- #158 (ICS Feeds + Trigger) — Merged (PR #166)
- #159 (Public Calendar Page) — PR in progress

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

*Last updated: 2026-03-22*
