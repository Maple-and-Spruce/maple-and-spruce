# webflow-public-e2e

**Read-only** Playwright smoke suite for the real, published Webflow pages.

It loads the live site and checks that the page-level redesign scripts on
`/upcoming-classes` and the class template ran and left a usable page. It never
types into a field, submits a form, registers, joins a waitlist or presses a
payment button. Safe to point at prod.

| Spec                       | Covers                                                                                                                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `upcoming-classes.spec.ts` | `msx` list, month headings, date blocks, craft chips + "All", "Open seats" toggle, row CTA → `/classes/<slug>#register` (desktop), phone sticky bar + no sideways scroll                                       |
| `class-page.spec.ts`       | First listed class and (if any) a full class: `cpx` hero facts, register CTA text + `#register`, registration widget mounts (waited for, not filled), no empty info cards, phone booking bar hides at the form |

Class URLs are discovered from `/upcoming-classes` on every run, so the suite
follows the calendar. With nothing listed, the tests skip.

## Run

```bash
pnpm exec playwright install chromium            # once
pnpm exec nx run webflow-public-e2e:e2e          # staging (default)
WEBFLOW_BASE_URL=https://mapleandsprucefolkarts.com pnpm exec nx run webflow-public-e2e:e2e   # prod
```

Two projects run: `desktop` (Desktop Chrome) and `mobile` (393×852, touch).

| Env                             | Default                                                          | Meaning                                                                                                                                                                    |
| ------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `WEBFLOW_BASE_URL`              | `https://maple-spruce-folk-arts-collective.webflow.io` (staging) | Site to test                                                                                                                                                               |
| `WEBFLOW_EXPECT_CLASS_REDESIGN` | `1` on staging, unset elsewhere                                  | When not `1`, the class-page redesign assertions skip on a page without `body.cpx` (the redesign ships to staging first). Set it to `1` once the redesign is live on prod. |

## CI

`.github/workflows/webflow-public-e2e.yml` runs daily against staging and on
manual dispatch (choose staging or prod). Not a PR check: Webflow publishes
don't come from repo PRs. No secrets needed.
