# Session Context

> **DIRECTIVE**: Keep this file updated with current work status. Archive completed sessions to `history/YYYY-MM-DD.md`.

---

## Current Status

**Date**: 2026-06-11
**Status**: Phase 4 complete; Phase 5 in progress. Spruce Room availability epic started (#467).

### Spruce Room availability — PR 1 shipped (2026-06-11)

The Spruce Room is going multi-tenant (music lessons, Music Together, ad hoc uses); David/Katie/Nathan need to know if it's free. Epic #467 holds the product decisions and architecture; the portal is the source of truth for room occupancy.

PR 1 (#468 / PR #470): `room` field on CalendarEvent/Class, `onLessonWrite` trigger deriving private room-blocking events from scheduled lessons (closing the gap where lessons were invisible to the calendar aggregation), `getRoomSchedule` admin callable + composite index, and the dashboard "Spruce Room right now" widget.

**Next steps**:
- PR 2 (#469): ad hoc "Book the Spruce Room" form, day strip + warn-and-confirm conflict warnings in ScheduleLessonDialog / class form / event form
- Ops: onboard Nathan (he signs up at `/login`, grant admin from `/users`) — decided full admin is fine

### Timekeeping retired — replaced by Square (2026-05-09)

### Timekeeping retired — replaced by Square (2026-05-09)

Square Payroll trial in place; hours will flow from Square Shifts (clock-in via the Square POS app on iPad). Square owns hours, rates, and payroll end-to-end. The custom `/timesheet` and `/employees` pages plus the 8 time-entry/employee Cloud Functions, `Role.Employee`, `EmployeeGuard`, and the timesheet components lib were deleted. No data was in production yet — Nathan never saw the page.

### Admin User Management — Shipped (2026-05-08)

Admin `/users` page where Katie/David can see everyone who's signed up to the admin app and grant or revoke admin access.

- 3 Cloud Functions: `listUsers` (Firebase Admin SDK + admin record join), `grantAdminRole`, `revokeAdminRole`
- Self-protection: admins cannot revoke their own admin role (would lock themselves out)
- `AppUser` domain type (Firebase Auth user + isAdmin)
- Components lib: `libs/react/users/` (`UserList`, `UserRolesDialog`)
- Nav: "Users" under Admin group

### Phase 4 Music Lessons — Complete

Branch: `feature/283-teacher-payouts` (PR #304)

All 6 sub-issues of epic #10 implemented:
- #278 Student records + admin UI
- #279 Lesson scheduling + recurring series
- #280 Private-pay invoice initiation
- #281 Square invoice delivery + webhook payment attribution
- #282 Hope Scholarship handling (rates, rendered-lesson tracking, invoice guard)
- #283 Teacher payout tracking (aggregation from both sources, substitute attribution)

**Requirements reviewed and updated** — REQUIREMENTS.md Phase 4 section rewritten to match actual implementation. Deferred items documented (lesson packages, teacher availability, public profiles).

### Phase 5: Unified Inventory, Etsy Push, & Sales Tracking

**Planning completed 2026-04-19.** Admin app is single source of truth for products, pushing to Etsy + Square. Sales on either channel auto-record with cross-channel inventory sync.

**Etsy API approved** (2026-03-27, `maplspruce-listings` app, Personal Access tier).

8 of 9 PRs merged 2026-04-19 → 2026-04-22. Picking up the remaining admin UI work (#312) on 2026-05-08, split into two reviewable PRs.

| PR | Issue | Title | Status |
|----|-------|-------|--------|
| 1 | #305 | Product variant model refactor | Merged (#314) |
| 2 | #306 | Square multi-variation catalog support | Merged (#318) |
| 3 | #307 | Push-to-Etsy Cloud Function | Merged (#319) |
| 4 | #308 | Etsy import multi-variant support | Merged (#322) |
| 5 | #309 | Sale recording + InventoryMovement audit log | Merged (#317) |
| 6 | #310 | Etsy order polling + cross-channel inventory sync | Merged (#324) |
| 7 | #311 | Etsy sync conflict detection + resolution | Merged (#325) |
| 8a | #312 | Admin UI — variants in ProductForm + DataTable | Merged (#402) |
| 8b | #312 | Admin UI — `/sales` page + Push-to-Etsy button | **In progress** (this PR) |
| 9 | #313 | Artist payout calculation + admin page | Merged (#321) |

**Full plan:** `.claude/plans/wild-scribbling-stearns.md`

### Image2Pages Webflow Widget (in flight)

Branch: `feat/image2pages-widget`

- New Webflow Code Component at `apps/webflow-components/src/Image2PagesWidget.tsx` + `image2pages.webflow.tsx`
- Pure-browser tiling library at `apps/webflow-components/src/lib/image2pages-tile.ts` (Canvas + pdf-lib, no server)
- Three sizing modes: by page count, target width (in), target height (in)
- Live preview canvas with dashed dark-brown page-boundary overlay; brand-themed via `@maple/react/theme`
- Tests: `apps/webflow-components/src/lib/image2pages-tile.spec.ts` (16 unit tests for `bestGrid` / `gridFromTargetSize` / `computeLayout`)
- Nx scaffolding added: `apps/webflow-components/project.json` + `vitest.config.ts` (test target only — no build target; webflow-cli still drives bundling via `webflow.json`)
- Published to workspace via `webflow library share` (env var aliasing: `WEBFLOW_TOKEN` → `WEBFLOW_WORKSPACE_API_TOKEN`)
- Embedded on new "Pattern Scaling Tool" page (page id `69d7921b12449f27596c57e9`, draft) with maple-nav + Image to Pages + Footer
- PR: [#231](https://github.com/Maple-and-Spruce/maple-and-spruce/pull/231)
- Ported from standalone prototype: github.com/david-shortman/image2pages-web

### Registration Launch: Meta Ads Readiness

Goal: enable paid Meta ads driving traffic to Webflow class registration pages.

### What's Done

**Wave 1 code (all merged):**
- PR #213 — Class roster admin page (#211)
- PR #214 — Email templates for confirmation + cancellation (#197)
- PR #216 — syncRegistrationCount Cloud Function (#143)
- PR #217 — Integration tests for syncClassToWebflow (#206)
- PR #218 — Integration test foundation with 8 domain-specific projects (#167)
- PR #226 — Square receipt URL in registrations + emails (#192) — auto-merge pending

**Registration flow verified:**
- Registration widget placed on Webflow CMS class detail page
- Props bound to CMS fields (firebase-id → classId)
- Tested working end-to-end with dev Square configuration

**Analysis completed:**
- #205 sync fields already implemented — remaining work is Webflow Designer binding
- #202 component already placed — just needed manual prop configuration (done)

### Remaining Work (Manual Ops)

| Task | Issue | Owner | Notes |
|------|-------|-------|-------|
| AWS account + SES setup | #223 | David | **Start first** — production access takes 24-48h |
| Firebase email extension | #195 | David | After SES; then run `tools/seed-email-templates.ts` |
| GA4 + GTM | #116 | David | Google/Webflow console work |
| Meta Pixel | #224 | David | After GTM; needed for ad optimization |
| Privacy + cancellation policy pages | #225 | David/Katie | Webflow content pages |
| Canonical domain + sitemap | #120 | David | DNS + Webflow settings |
| Switch widget to prod Square credentials | — | David | Webflow Designer, last step |
| Upcoming Classes page enhancements | #210 | In progress | Agent working on Webflow MCP |

### Issues Created This Session

| Issue | Title |
|-------|-------|
| #215 | Admin email template management with preview |
| #222 | Configure required status checks for PR merging |
| #223 | Create AWS account + SES for Maple & Spruce |
| #224 | Install Meta Pixel via GTM |
| #225 | Privacy policy + cancellation policy pages |

### Key Decisions Made

- **Handlebars templates** for emails (matches existing `createRegistration` code pattern, easier to update than inline HTML)
- **Agent Teams** enabled for parallel development (experimental feature)
- **Per-domain integration test apps** structure from #218 (artist, class, instructor, etc.)
- **vitest.config.ts** excludes integration test apps from unit test runner

### Blockers
- SES production access approval (24-48h) blocks email testing
- No blockers for registration flow itself — working on dev

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
