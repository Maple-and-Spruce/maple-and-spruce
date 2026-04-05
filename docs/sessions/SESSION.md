# Session Context

> **DIRECTIVE**: Keep this file updated with current work status. Archive completed sessions to `history/YYYY-MM-DD.md`.

---

## Current Status

**Date**: 2026-04-05
**Status**: Integration test coverage expanded, Webflow CMS pipeline polishing

### Current Focus: Integration Test Coverage (#167)

PR #218 adds 84 new integration tests across 8 domain-specific nx projects:
- Split monolithic test project for `nx affected` efficiency
- Shared utils extracted to `libs/firebase/integration-test-utils`
- First Firestore trigger test (`onClassWrite` → calendar event sync)
- 120 total tests passing against Firebase emulators

Follow-up issues created for remaining coverage:
- #219 — ICS calendar feed endpoints (HTTP pattern)
- #220 — Registration admin + remaining maple-core endpoints
- #221 — Square payment/catalog functions (needs Square sandbox)
- #206 — syncClassToWebflow trigger (already existed)

### Previous Focus: Class Registration on Webflow (CMS Pipeline Done)

Full CMS pipeline built and working:
- Classes sync from Firebase → Webflow CMS via `syncClassToWebflow` trigger
- Listing page at `/upcoming-classes` with CMS Collection List card grid
- Detail template page at `/classes/[slug]` with class info + registration component
- Registration component reads `firebase-id` from CMS and enables checkout

**Live test:** `mapleandsprucefolkarts.com/classes/trigger-test-class`

### Open PRs

| PR | Branch | Status | Description |
|----|--------|--------|-------------|
| #204 | `feature/141-sync-class-to-webflow` | Open | Full CMS pipeline + Webflow pages |
| (needs PR) | `feature/190-registration-lookup` | Pushed, no PR | Backend for customer self-service lookup + cancel |

### Completed This Session (2026-04-04 — 2026-04-05)

**CMS Pipeline (PR #204):**
- ClassService for Webflow CMS sync (mirrors ArtistService pattern)
- syncClassToWebflow Firestore trigger (published → sync, unpublished → remove)
- Display-formatted fields: price-display, duration-display, spots-display
- Classes CMS collection created in Webflow (19 fields including firebase-id)
- Upcoming Classes listing page with CMS Collection List
- Class detail template page with registration component
- Card styling, link decoration, responsive breakpoints
- WEBFLOW_CLASSES_COLLECTION_ID configured in .env.dev/.env.prod
- 48 webflow library tests passing

**Registration Widget Updates:**
- Removed redundant class info card (CMS page already shows it)
- Fixed onSuccess handler signature

**Issues Closed:** #139, #140, #141, #142, #144, #145, #146

### Remaining Work

**Immediate polish (#205):**
- Add `time-display` formatted field to sync
- Bind remaining CMS fields on detail page (description, what-to-bring, etc.)
- Create real test class with all fields populated
- Hide empty detail cards with Webflow conditional visibility

**Next priorities:**
- #143 — Sync registration count changes to Webflow CMS (spots remaining updates)
- #202 — Document registration component CMS binding (done manually)
- #205 — Fix missing class data display
- #163 — Payment & Registration Testing (integration tests, PR #187)
- Self-service features (#189-192, #199)
- Email infrastructure (#195-197)

### Key Decisions Made

- **Webflow Code Components** for React integration — Shadow DOM, designer-configurable props
- **CMS-powered class browsing** with React component only for registration/payment
- **Pre-formatted display fields** in sync (price-display, duration-display, spots-display) to avoid client-side formatting
- **Registration component shows form only** — class details handled by CMS page layout

### Blockers
- None currently

---

## Quick Reference

### Environments
| Environment | Web App | Firebase Project | Square |
|-------------|---------|------------------|--------|
| Production | business.mapleandsprucefolkarts.com | `maple-and-spruce` | Production API |
| Development | business-dev.mapleandsprucefolkarts.com | `maple-and-spruce-dev` | Sandbox API |
| Webflow (public) | mapleandsprucefolkarts.com | Both (via `env` prop) | Both (via `squareAppId` prop) |

### Webflow CMS
| Collection | ID | Fields |
|------------|-----|--------|
| Artists | `696f08a32a1eb691801f17ad` | Existing |
| Classes | `69d0fb7572d9e153c22ce489` | 19 fields incl firebase-id, display fields |

### Webflow Component Publishing
```bash
npx webflow library share --manifest apps/webflow-components/webflow.json --skip-update-check
```

### Test Commands
```bash
npm test
npx vitest run --config libs/firebase/webflow/vitest.config.ts
npx nx run domain:test
./tools/validate-function-tsconfigs.sh
```

### Deployment
**Let CI/CD handle deployments** - don't run manual `firebase deploy` commands.

---

## Session History

See `history/` folder for detailed session logs:
- [2026-02-03](history/2026-02-03.md) - Phase 3c: Registration system, security fixes, Next.js 16
- [2026-01-25](history/2026-01-25.md) - Sync conflict resolution, Storybook test fixes, Phase 3a/3b
- [2026-01-20](history/2026-01-20.md) - Webflow CMS sync, dev/prod separation
- [2026-01-19](history/2026-01-19.md) - Dev environment fixes, product/artist integration
- [2026-01-18](history/2026-01-18.md) - Square integration foundation, dev/prod separation

---

*Last updated: 2026-04-05*
