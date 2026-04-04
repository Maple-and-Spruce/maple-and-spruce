# Session Context

> **DIRECTIVE**: Keep this file updated with current work status. Archive completed sessions to `history/YYYY-MM-DD.md`.

---

## Current Status

**Date**: 2026-04-03
**Status**: Webflow registration widget working end-to-end, CMS pipeline next

### Current Focus: Class Registration on Webflow

Registration + payment is working on the Webflow public site via a React Code Component embedded in Shadow DOM. Test page live at `mapleandsprucefolkarts.com/test-class-enrollment` with a hardcoded class ID.

**Next steps to make it real:**
1. Build Classes CMS collection in Webflow (#139) — needs `firebase-id` field
2. Build syncClassToWebflow Cloud Function (#140, #141)
3. Build Classes listing page and detail template in Webflow (#144, #145)
4. Bind registration component's `classId` prop to CMS `firebase-id` field (#202)

### Open PRs

| PR | Branch | Status | Description |
|----|--------|--------|-------------|
| #201 | `feature/200-webflow-registration-widget` | Open | Webflow Code Component + Shadow DOM fixes |
| #194 | `fix/registration-confirmation-improvements` | Open | Confirmation page improvements |
| (needs PR) | `feature/190-registration-lookup` | Pushed, no PR | Backend for customer self-service lookup + cancel |

### Completed This Session (2026-04-03)

- **PR #188** (merged): Fixed Firestore Timestamp storage bug — dates were stored as strings, broke `getPublicClasses` query
- **Firestore index**: Added composite index for `classes` (status + dateTime)
- **Square env vars**: Configured `NEXT_PUBLIC_SQUARE_*` on Vercel dev, registration payment flow working
- **Webflow Code Component** (PR #201):
  - Created `apps/webflow-components/` with `@webflow/react` Code Components
  - Solved Shadow DOM + MUI styling via `@webflow/emotion-utils` decorator
  - Solved Shadow DOM + Square SDK — card form mounts outside Shadow DOM as sibling
  - Submit button portaled to external container with inline brand styles
  - Published to Katie's Workspace, tested end-to-end on Webflow
- **Backend: Self-service endpoints** (branch `feature/190-registration-lookup`):
  - `lookupRegistration` Cloud Function (public, confirmation number + email)
  - `cancelRegistrationPublic` Cloud Function (public, with Square refund + 48hr cutoff)
  - Added `confirmationNumber` to Registration domain type + repository
- **Confirmation page** (PR #194): Shows class name, amount, customer name; updated contact email
- **GitHub Issues Created**: #189-202 covering self-service, email infra, Apple/Google Pay, Webflow CMS pipeline

### Key Decisions Made

- **Webflow Code Components** (not script tag embed) for React integration — official support, Shadow DOM isolation, designer-configurable props
- **CMS-powered class browsing** with React component only for the interactive registration/payment — hybrid approach
- **Registration lives on Webflow**, not admin app — customers never touch the admin site
- **Square SDK + Shadow DOM workaround**: Card container mounted outside Shadow DOM as sibling element

### GitHub Issues — Registration Pipeline

**Webflow CMS Pipeline (next up):**
- #139 — Create Classes CMS collection in Webflow
- #140 — Build ClassService for Webflow CMS sync
- #141 — Build syncClassToWebflow Cloud Function
- #142 — Configure WEBFLOW_CLASSES_COLLECTION_ID secret
- #143 — Sync registration count changes to Webflow CMS
- #144 — Build Classes listing page in Webflow
- #145 — Build Class detail template page in Webflow
- #202 — Embed registration component on class detail page

**Customer Self-Service:**
- #189 — Epic: Customer Self-Service
- #190 — Registration lookup page + endpoint
- #191 — Self-service cancellation + refund
- #192 — Capture Square receipt URL
- #199 — Frontend lookup/cancellation page

**Email:**
- #195 — Install Firebase Trigger Email extension
- #196 — Configure Amazon SES
- #197 — Email templates

**Payments:**
- #198 — Apple Pay + Google Pay

**Webflow Epic:**
- #200 — Epic: Webflow Class Registration Integration

### Blockers
- None currently

### Webflow Component Publishing

To republish the Code Component after changes:
```bash
npx webflow library share --manifest apps/webflow-components/webflow.json --skip-update-check
```
Requires `WEBFLOW_WORKSPACE_API_TOKEN` in root `.env` (gitignored). Token generated from Webflow Dashboard → Apps & Integrations → Manage → Generate API Token (Code components: Read and write).

---

## Quick Reference

### Environments
| Environment | Web App | Firebase Project | Square |
|-------------|---------|------------------|--------|
| Production | business.mapleandsprucefolkarts.com | `maple-and-spruce` | Production API |
| Development | business-dev.mapleandsprucefolkarts.com | `maple-and-spruce-dev` | Sandbox API |
| Webflow (public) | mapleandsprucefolkarts.com | Both (via `env` prop) | Both (via `squareAppId` prop) |

### Test Commands
```bash
npm test
npm run test:coverage
npx nx run validation:test
npx nx run domain:test
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

*Last updated: 2026-04-03*
