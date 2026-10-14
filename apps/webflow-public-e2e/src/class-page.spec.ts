/**
 * Class page template — the redesign script adds `cpx` to <body> and rebuilds
 * the hero, facts, buy box, materials cards and a phone booking bar.
 *
 * READ-ONLY: the registration widget is only waited for, never filled. No
 * button inside it is clicked.
 *
 * Runs against the first listed class and, when the calendar has one, a full
 * class (whose CTA turns into the waitlist).
 */
import { test, expect, type Page } from '@playwright/test';
import {
  discoverClasses,
  expectClassRedesign,
  expectNoHorizontalOverflow,
  isMobile,
  type ListedClasses,
} from './site';

const CTA_TEXT = /^(Save my seat|Reserve my seat|Join the waitlist)$/;
// The checkout form for an open class, the waitlist form for a full one.
const WIDGET_READY = /Your Information|Join waitlist|first-come, first-served/i;
// Cold-starting callables make the widget slow on the first hit of the day.
const WIDGET_TIMEOUT = 30_000;

let listed: ListedClasses = { first: null, full: null };

test.beforeAll(async ({ browser }) => {
  listed = await discoverClasses(browser);
});

const KINDS = [
  { kind: 'first listed class', pick: (l: ListedClasses) => l.first },
  { kind: 'full class', pick: (l: ListedClasses) => l.full },
] as const;

for (const { kind, pick } of KINDS) {
  test.describe(`class page: ${kind}`, () => {
    let path: string;

    test.beforeEach(async ({ page }) => {
      const found = pick(listed);
      test.skip(!found, `No ${kind} on /upcoming-classes right now`);
      path = found as string;
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      await expect(page.locator('h1.cls-class-name')).toBeVisible();
    });

    test('registration widget mounts', async ({ page }) => {
      await expect(page.locator('#register')).toBeAttached();
      // Playwright locators pierce the code-island's open shadow root.
      await expect(page.locator('#register code-island')).toContainText(
        WIDGET_READY,
        { timeout: WIDGET_TIMEOUT },
      );
    });

    test.describe('redesign', () => {
      test.beforeEach(async ({ page, baseURL }) => {
        await skipUnlessRedesigned(page, baseURL);
      });

      test('hero facts and register CTA', async ({ page }) => {
        await expect(page.locator('body')).toHaveClass(/(^|\s)cpx(\s|$)/);

        const facts = page.locator('.cpx-facts');
        await expect(facts).toBeVisible();
        // Date: a weekday or month name, or "N sessions"; time: "6:00" or
        // the "Times vary" wording.
        await expect(facts).toContainText(
          /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)|sessions/,
        );
        await expect(facts).toContainText(/\d{1,2}:\d{2}|Times vary/);

        const cta = page.locator('.cls-register-btn');
        await expect(cta).toHaveAttribute('href', '#register');
        await expect(cta).toHaveText(CTA_TEXT);
        if (kind === 'full class') {
          await expect(cta).toHaveText('Join the waitlist');
        }
      });

      test('no empty info cards', async ({ page }) => {
        // `.cpx-cards` only exists when the class has materials / what-to-bring.
        const texts = await page
          .locator('.cpx-card')
          .evaluateAll((els) => els.map((e) => (e.textContent ?? '').trim()));
        for (const text of texts) expect(text).not.toBe('');
      });

      test('phone booking bar hides at the form', async ({
        page,
      }, testInfo) => {
        test.skip(!isMobile(testInfo.project.name), 'Phone layout only');
        const bar = page.locator('.cpx-mbar');
        await expect(bar).toBeVisible();
        await expect(bar).not.toHaveClass(/is-hidden/);
        await expect(bar.locator('a')).toHaveAttribute('href', '#register');
        await expectNoHorizontalOverflow(page);

        await page.locator('#register').scrollIntoViewIfNeeded();
        await expect(bar).toHaveClass(/is-hidden/);
      });

      test('no sideways scroll', async ({ page }) => {
        await expectNoHorizontalOverflow(page);
      });
    });
  });
}

async function skipUnlessRedesigned(
  page: Page,
  baseURL: string | undefined,
): Promise<void> {
  if (expectClassRedesign(baseURL)) return;
  // Give the page script a moment; it runs on DOMContentLoaded.
  await page.waitForLoadState('domcontentloaded');
  const redesigned = await page.evaluate(() =>
    document.body.classList.contains('cpx'),
  );
  test.skip(
    !redesigned,
    'Class-page redesign is not published to this site yet (set WEBFLOW_EXPECT_CLASS_REDESIGN=1 to require it)',
  );
}
