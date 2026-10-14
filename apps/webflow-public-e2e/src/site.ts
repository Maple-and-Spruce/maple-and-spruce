import { expect, type Browser, type Page } from '@playwright/test';

export const STAGING_URL =
  'https://maple-spruce-folk-arts-collective.webflow.io';

/** The listing page every class link is discovered from. */
export const LISTING_PATH = '/upcoming-classes';

/**
 * The class-page redesign is published to staging before prod. Until it is on
 * prod, a prod run would fail every redesign assertion for a reason nobody
 * needs paging about, so those assertions skip when the page plainly hasn't
 * got the redesign (no `cpx` on <body>).
 *
 * Staging always expects it. Anywhere else, `WEBFLOW_EXPECT_CLASS_REDESIGN=1`
 * turns the skip into a failure — set it once the redesign is live on prod.
 * When prod gains the redesign, `cpx` appears and the assertions run anyway.
 */
export function expectClassRedesign(baseURL: string | undefined): boolean {
  if (process.env['WEBFLOW_EXPECT_CLASS_REDESIGN'] === '1') return true;
  return !baseURL || new URL(baseURL).host === new URL(STAGING_URL).host;
}

export interface ListedClasses {
  /** Path of the first listed class, e.g. `/classes/<slug>`. */
  first: string | null;
  /** Path of the first listed class that is full (`.msx-full`), if any. */
  full: string | null;
}

/** Load the listing once and wait for its page script to have run. */
export async function openListing(page: Page): Promise<void> {
  await page.goto(LISTING_PATH, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.cls-card-grid.msx')).toBeAttached();
}

/**
 * Discover class URLs from the live listing instead of hard-coding a slug —
 * the calendar changes every week.
 */
export async function discoverClasses(
  browser: Browser,
): Promise<ListedClasses> {
  const context = await browser.newContext({
    baseURL: process.env['WEBFLOW_BASE_URL'] || STAGING_URL,
  });
  const page = await context.newPage();
  try {
    await page.goto(LISTING_PATH, { waitUntil: 'domcontentloaded' });
    await page
      .locator('.cls-card-grid .cls-card')
      .first()
      .waitFor({ state: 'attached', timeout: 15_000 })
      .catch(() => undefined);
    return await page.evaluate(() => {
      const path = (card: Element | null | undefined): string | null => {
        const href = card
          ?.querySelector('.cls-card-link')
          ?.getAttribute('href');
        return href ? new URL(href, location.href).pathname : null;
      };
      const cards = Array.from(
        document.querySelectorAll('.cls-card-grid .cls-card'),
      );
      return {
        first: path(cards[0]),
        full: path(cards.find((c) => c.classList.contains('msx-full'))),
      };
    });
  } finally {
    await context.close();
  }
}

/** The page must never scroll sideways (the commonest phone-layout break). */
export async function expectNoHorizontalOverflow(page: Page): Promise<void> {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    )
    .toBe(true);
}

export function isMobile(projectName: string): boolean {
  return projectName === 'mobile';
}
