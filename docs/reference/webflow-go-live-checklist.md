# Webflow Go-Live Checklist

> Master checklist for launching the Maple & Spruce public website on Webflow.
> Epic: [#112](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/112)

---

## Color Palette Note

The Webflow site uses an intentionally different color palette from the admin app:

| System | Primary | Background | Text | Source |
|--------|---------|------------|------|--------|
| **Webflow (public site)** | Lime green `#E0EF7D` | White `#FFFFFF` | Near-black `#1E1E1E` | **Source of truth** |
| **Admin app (MUI)** | Sage green `#6B7B5E` | Cream `#D5D6C8` | Dark brown `#4A3728` | Will align to Webflow |

Webflow defines the brand's visual identity. The admin app will be updated to match (#122).

---

## Pre-Launch Blockers

| Item | Issue | Status |
|------|-------|--------|
| Remove "asdfasdf" placeholder from Music page | [#113](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/113) | **Done** (not found; may have been removed already) |
| Fix Contact page address ("\<location coming soon\>!") | [#113](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/113) | **Done** (updated with opening date + address) |
| Fix malformed fiddle repair link on Contact | [#113](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/113) | **Done** (now uses page link, not URL) |
| Fix broken anchor links (`#`) in navigation | [#113](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/113) | **Done** (5 broken hrefs fixed in maple-nav) |
| Add pre-opening messaging to all pages | - | **Done** (banner in maple-nav component, shows on all pages) |
| Fix Craft Club typo ("not though") | - | **Done** ("not though" → "not through") |
| Remove specific jam times (pre-opening) | - | **Done** (Music + Contact FAQ updated) |
| Update Our Story opening date | - | **Done** ("soft opening mid-2026" → "Opening May 2026") |
| Create Music Lessons page (`/music-lessons`) | - | **Done** |
| Create Craft Classes page (`/classes`) | - | **Done** |
| Create Shop page (`/shop`) | - | **Done** |
| Add new pages to navigation | - | **Done** (Music Lessons + Shop in maple-nav) |
| Fix Artists page 404 | [#114](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/114) | Pending |
| Remove CMS test data (4 fake artists) | [#114](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/114) | Pending |
| Add Katie's real artist profile via admin + sync | [#114](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/114) | Pending |

## High Priority (Before Launch)

| Item | Issue | Status |
|------|-------|--------|
| SEO titles + descriptions on all 7 pages | [#115](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/115) | Pending |
| Open Graph tags for social sharing | [#115](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/115) | Pending |
| Google Analytics / GTM setup | [#116](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/116) | Pending |
| Fix 11x hardcoded `#6C7A5E` (not in variable system) | [#117](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/117) | Pending |
| Fix Heading 2 wrong color (`#413023`) | [#117](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/117) | Pending |
| Fix Button 2 (only styled at tiny breakpoint) | [#117](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/117) | Pending |
| Fix Card Accent Tertiary transparent text | [#117](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/117) | Pending |
| Remove `is-secondary Copy` leftover style | [#117](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/117) | Pending |
| Add alt text to ~10 images | [#118](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/118) | Pending |

## Launch Day

| Item | Status |
|------|--------|
| All blockers resolved | Pending |
| All high priority items resolved | Pending |
| Final visual review on all breakpoints | Pending |
| Publish site in Webflow | Pending |
| Verify all pages load correctly | Pending |
| Verify sitemap.xml is accessible | Pending |
| Verify GA4 is tracking (Real-Time report) | Pending |

## Post-Launch

| Item | Issue | Status |
|------|-------|--------|
| Rename 37 default-named Webflow classes | [#119](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/119) | Pending |
| Audit and remove 311 empty styles | [#119](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/119) | Pending |
| Consolidate 35 font sizes to type scale | [#119](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/119) | Pending |
| Choose canonical domain + set up redirects | [#120](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/120) | Pending |
| Submit sitemap to Google Search Console | [#120](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/120) | Pending |
| Fix card padding responsive bug (MobileP) | [#121](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/121) | Pending |
| Full breakpoint QA across all pages | [#121](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/121) | Pending |
| Align admin app MUI theme to Webflow palette | [#122](https://github.com/Maple-and-Spruce/maple-and-spruce/issues/122) | Pending |

---

## Domains

| Domain | Role | Status |
|--------|------|--------|
| `mapleandsprucefolkarts.com` | Primary (recommended) | Configured |
| `www.mapleandsprucefolkarts.com` | www redirect | Configured |
| `mapleandsprucewv.com` | Secondary (redirect to primary) | Configured, needs redirect |
| `www.mapleandsprucewv.com` | Secondary www | Configured, needs redirect |

## Webflow Site

| Property | Value |
|----------|-------|
| Site ID | `691a5d6c07ba1bf4714e826f` |
| CMS Collection (Artists) | `696f08a32a1eb691801f17ad` |
| Last Published | 2026-01-31 |
| Last Updated | 2026-02-22 |
| Pages | 14 (Home, Music, Music Lessons, Craft, Craft Classes, Craft Club, Fiddle Repair, Contact, Our Artists, Our Story, Gallery, Shop, Artists Template, untitled/orphan) |

## Architecture Reference

- CMS sync function: `syncArtistToWebflow` ([deployed-functions.md](deployed-functions.md))
- Webflow utility: `libs/firebase/webflow/src/lib/webflow.utility.ts`
- Artist service: `libs/firebase/webflow/src/lib/artist.service.ts`
- Integration guide: [WEBFLOW-INTEGRATION.md](../guides/WEBFLOW-INTEGRATION.md)
- Architecture decision: [ADR-016](../architecture/decisions/ADR-016-webflow-integration-strategy.md)

---

*Last updated: 2026-03-17*
