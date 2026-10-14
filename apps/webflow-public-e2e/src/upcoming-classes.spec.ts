/**
 * /upcoming-classes — the redesigned listing (page-level script adds the
 * `msx` layer: month headings, date blocks, filter chips, CTAs, phone bar).
 *
 * READ-ONLY: clicks filter chips and follows a link; never registers.
 * Written against whatever is on the live calendar, so counts are relative.
 */
import { test, expect, type Page } from '@playwright/test';
import { expectNoHorizontalOverflow, isMobile, openListing } from './site';

const CRAFT_IDS = ['glass', 'jewelry', 'pottery', 'fiber', 'other'];

const rows = (page: Page) => page.locator('.cls-card-grid.msx .cls-card');
const visibleRows = (page: Page) => rows(page).filter({ visible: true });

test.describe('/upcoming-classes', () => {
  test.beforeEach(async ({ page }) => {
    await openListing(page);
    test.skip(
      (await rows(page).count()) === 0,
      'No classes are listed right now',
    );
  });

  test('renders the redesigned list', async ({ page }) => {
    await expect(page.locator('.cls-card-grid.msx')).toBeVisible();
    await expect(page.locator('.msx-month').first()).toBeVisible();
    await expect(page.locator('.cls-card .msx-date').first()).toBeAttached();
    await expect(
      page.locator('.msx-filters .msx-chip', { hasText: /^All$/ }),
    ).toBeVisible();
  });

  test('craft chips partition the rows and "All" restores them', async ({
    page,
  }) => {
    const total = await rows(page).count();
    await expect(visibleRows(page)).toHaveCount(total);

    const craftChips = page.locator('.msx-filters .msx-chip[data-id]');
    const ids = (
      await craftChips.evaluateAll((els) =>
        els.map((e) => (e as HTMLElement).dataset['id'] ?? ''),
      )
    ).filter((id) => CRAFT_IDS.includes(id));
    test.skip(ids.length === 0, 'No craft chips (only one craft listed)');

    // Every row belongs to exactly one craft, and every craft on the calendar
    // gets a chip, so the per-craft counts must add up to the whole list.
    let sum = 0;
    for (const id of ids) {
      await page.locator(`.msx-filters .msx-chip[data-id="${id}"]`).click();
      await expect(
        page.locator(`.msx-filters .msx-chip[data-id="${id}"]`),
      ).toHaveAttribute('aria-pressed', 'true');
      const shown = await visibleRows(page).count();
      expect(shown, `chip "${id}" shows at least one row`).toBeGreaterThan(0);
      if (ids.length > 1) {
        expect(shown, `chip "${id}" hides other crafts`).toBeLessThan(total);
      }
      sum += shown;
    }
    expect(sum).toBe(total);

    await page.locator('.msx-filters .msx-chip[data-id="all"]').click();
    await expect(visibleRows(page)).toHaveCount(total);
  });

  test('"Open seats" hides full classes', async ({ page }) => {
    const toggle = page.locator('.msx-filters .msx-toggle');
    test.skip((await toggle.count()) === 0, 'No full classes, so no toggle');

    const before = await visibleRows(page).count();
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(
      page.locator('.cls-card-grid.msx .cls-card.msx-full').filter({
        visible: true,
      }),
    ).toHaveCount(0);
    expect(await visibleRows(page).count()).toBeLessThanOrEqual(before);

    await toggle.click();
    await expect(visibleRows(page)).toHaveCount(before);
  });

  test('row CTA goes to the class registration form', async ({
    page,
  }, testInfo) => {
    test.skip(
      isMobile(testInfo.project.name),
      'The row CTA is hidden on phones; the sticky bar covers it',
    );
    const row = visibleRows(page).first();
    const cta = row.locator('.msx-cta');
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page).toHaveURL(/\/classes\/[^/#?]+#register$/);
  });

  test('phone: sticky bar links to registration, no sideways scroll', async ({
    page,
  }, testInfo) => {
    test.skip(!isMobile(testInfo.project.name), 'Phone layout only');
    const openRows = await page
      .locator('.cls-card-grid.msx .cls-card:not(.msx-full)')
      .count();
    // The bar advertises the next class with seats; none open means no bar.
    if (openRows > 0) {
      await expect(page.locator('.msx-bar a')).toHaveAttribute(
        'href',
        /#register$/,
      );
    }
    await expectNoHorizontalOverflow(page);
  });
});
