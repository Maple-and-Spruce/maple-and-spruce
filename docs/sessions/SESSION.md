# Session Context

> **DIRECTIVE**: Keep this file updated with current work status. Archive completed sessions to `history/YYYY-MM-DD.md`.

---

## Current Status

**Date**: 2026-01-25
**Status**: 🚀 Phase 3a/3b PR Ready for Review

### Active Work

**PR #106: Phase 3a/3b - Classes & Workshops Backend + Admin UI**
- Backend foundation complete (13 Cloud Functions)
- Admin UI complete (Instructors + Classes pages)
- Storybook stories added for all new components
- CI coverage reporting configured
- Awaiting CI checks to pass

### Completed Today

- **Phase 3a: Backend Foundation**
  - Domain types: Payee, Instructor, Class, ClassCategory, Registration
  - Validation suites with unit tests
  - Repositories with filtering capabilities
  - 13 Cloud Functions for Instructor/Class/ClassCategory CRUD

- **Phase 3b: Admin UI**
  - InstructorList, InstructorForm, InstructorFilterToolbar components
  - ClassList, ClassForm, ClassFilterToolbar components
  - `/instructors` and `/classes` admin pages
  - useInstructors and useClasses data hooks

- **Storybook & Testing**
  - Stories for all Phase 3 components
  - Mock fixtures for instructors and classes
  - CI coverage reporting with 80% threshold
  - Fixed payRate/payRateType validation coupling
  - Fixed Firestore timestamp conversion

### Key Design Decisions Made

1. **Payee Interface Pattern** - Composition over inheritance
   - Artist and Instructor both implement Payee interface
   - Enables shared payout logic without tight coupling

2. **Square for Class Payments** (supersedes ADR-005)
   - Using Square for all payments (consistent with POS)
   - NOT using Stripe as originally planned

3. **Catalog-First Class Browsing**
   - Browse classes by category/date/instructor
   - Calendar view deferred (can be added later)

### Previous Session (2026-01-25 - morning)

- **Sync Conflict Resolution (#28) - COMPLETE:**
  - Closed GitHub issue #28 after PR #103 merged
  - Full implementation of sync conflict detection and resolution UI

- **Storybook Interaction Test Fixes:**
  - Fixed MUI Dialog tests using `screen` instead of `canvas` (portal rendering)
  - Fixed DataGrid tests using `getAllByRole` for multiple resolve buttons
  - Added ADR-019: Storybook Interaction Testing Patterns

### Next Steps

1. Wait for CI checks on PR #106
2. Fix any CI failures
3. Merge PR #106
4. Add ADR-020 for Phase 3 design decisions
5. Begin Phase 3c: Registration system

### Blockers
- None currently

---

## Quick Reference

### Environments
| Environment | Web App | Firebase Project | Square |
|-------------|---------|------------------|--------|
| Production | business.mapleandsprucefolkarts.com | `maple-and-spruce` | Production API |
| Development | business-dev.mapleandsprucefolkarts.com | `maple-and-spruce-dev` | Sandbox API |

### Required Vercel Env Vars
| Project | `NEXT_PUBLIC_FIREBASE_ENV` |
|---------|---------------------------|
| Production | `prod` ✅ |
| Development | `dev` ✅ |

### Phase 3 Components

| Library | Components |
|---------|------------|
| `libs/react/instructors/` | InstructorList, InstructorForm, InstructorFilterToolbar |
| `libs/react/classes/` | ClassList, ClassForm, ClassFilterToolbar |

### New Cloud Functions (Phase 3)

**Instructor:** getInstructors, getInstructor, createInstructor, updateInstructor, deleteInstructor

**Class:** getClasses, getClass, createClass, updateClass, deleteClass, uploadClassImage, getPublicClasses

**ClassCategory:** getClassCategories

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
- [2026-01-25](history/2026-01-25.md) - Sync conflict resolution, Storybook test fixes, Phase 3a/3b
- [2026-01-20](history/2026-01-20.md) - Webflow CMS sync, dev/prod separation
- [2026-01-19](history/2026-01-19.md) - Dev environment fixes, product/artist integration
- [2026-01-18](history/2026-01-18.md) - Square integration foundation, dev/prod separation

---

*Last updated: 2026-01-25*
