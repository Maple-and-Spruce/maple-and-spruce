/**
 * Registration FE→BE wiring smoke tests.
 *
 * These run against the `registration-test-harness` Vite app, which
 * mounts the production `RegistrationWidget` and points it at the
 * local Firebase emulator. Seeded data comes from
 * `@maple/firebase/integration-test-utils` (same fixtures the cloud-
 * function integration tests use), via `global-setup.ts`.
 *
 * Why these tests exist:
 * - Storybook interaction tests mock `onCalculateCost`; they cannot
 *   catch a bug in the args the frontend chooses to send (#423 was
 *   exactly that — quantity off by one).
 * - Cloud-function integration tests verify the backend in isolation;
 *   they cannot see a frontend that lies about its own state.
 * - Real Firestore enforces composite indexes; emulator does not.
 *   When this same suite is re-run against the deployed dev project
 *   in Phase 2, a missing index will trip these tests too.
 *
 * Scope: load → attendee management → cost recalc → discount apply.
 * Square tokenization is intentionally out of scope for Phase 1 (the
 * widget's "Register & Pay" button stays disabled until the Square
 * Web Payments SDK marks the card form ready, which requires real
 * sandbox credentials — that's a Phase 2/3 problem).
 */
import { test, expect, Page } from '@playwright/test';

const CLASS_ID = 'test-class-published';
const PRICE_LABEL = '$45.00'; // PUBLISHED_CLASS.priceCents = 4500

async function openWidget(page: Page) {
  await page.goto(`/?classId=${CLASS_ID}`);
  // The widget doesn't show the class title as a separate heading on
  // the registration view (it lives in the success view post-purchase).
  // Wait for the cost-summary line item to appear instead — its
  // presence is proof BOTH `getPublicClass` and the initial
  // `calculateRegistrationCost` round-trip succeeded against the
  // emulator. Generous timeout covers cold-start of the first call.
  await expect(page.getByText(`1 x ${PRICE_LABEL}`)).toBeVisible({
    timeout: 20_000,
  });
}

test('loads cost summary from the emulator', async ({ page }) => {
  await openWidget(page);
  // openWidget already proved the first round-trips ran; this asserts
  // the totals math the server returned (4500 + 6% tax = 4770). The
  // total is rendered as an h6 heading inside the cost summary box —
  // targeting it by role avoids ambiguity with the "Register & Pay
  // $47.70" button label and the un-discounted-base "$45.00" line.
  await expect(page.getByText(`1 x ${PRICE_LABEL}`)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '$47.70' })
  ).toBeVisible();
});

test('adding an attendee recalculates cost from the server', async ({
  page,
}) => {
  await openWidget(page);

  await page.getByRole('button', { name: /Add another person/ }).click();

  // The line item ("2 x $45.00") and the totals must agree because
  // both come from the same server response (the structural guard
  // we landed in #424). If a frontend off-by-one returned, the
  // line item would still say 2 but the totals would reflect 3 —
  // these assertions would fail in lockstep.
  await expect(page.getByText(`2 x ${PRICE_LABEL}`)).toBeVisible();
  // 2 × $45 = $90 base, + 6% WV tax = $95.40. Target the Total
  // heading directly to avoid clashing with the Pay button label.
  await expect(page.getByText(/WV Sales Tax \(6%\)/)).toBeVisible();
  await expect(
    page.getByRole('heading', { name: '$95.40' })
  ).toBeVisible();
});

test('removing an attendee recalculates cost from the server', async ({
  page,
}) => {
  await openWidget(page);

  await page.getByRole('button', { name: /Add another person/ }).click();
  await page.getByRole('button', { name: /Add another person/ }).click();
  await expect(page.getByText(`3 x ${PRICE_LABEL}`)).toBeVisible();

  await page
    .getByRole('button', { name: 'Remove additional person 1' })
    .click();

  await expect(page.getByText(`2 x ${PRICE_LABEL}`)).toBeVisible();
});

test('applying a percentage discount code reduces the total', async ({
  page,
}) => {
  await openWidget(page);

  await page.getByLabel('Enter code').fill('SAVE10');
  await page.getByRole('button', { name: 'Apply' }).click();

  // SAVE10 → 10% off → "10% off applied!" alert + -$4.50 line.
  // (formatDiscount returns "10% off"; the widget appends " applied!")
  await expect(page.getByText(/10% off applied/i)).toBeVisible();
  await expect(page.getByText('-$4.50')).toBeVisible();
});

test('applying a fixed-amount discount code reduces the total', async ({
  page,
}) => {
  await openWidget(page);

  await page.getByLabel('Enter code').fill('TENOFF');
  await page.getByRole('button', { name: 'Apply' }).click();

  // TENOFF → "$10.00 off applied!" alert + -$10 line.
  await expect(page.getByText(/\$10\.00 off applied/i)).toBeVisible();
  await expect(page.getByText('-$10.00')).toBeVisible();
});

test('an invalid discount code is silently ignored', async ({ page }) => {
  await openWidget(page);

  await page.getByLabel('Enter code').fill('NOPE');
  await page.getByRole('button', { name: 'Apply' }).click();

  // Backend returns the un-discounted cost; no discount line, no error.
  await expect(page.getByText(/applied/i)).toHaveCount(0);
  // The base cost still reads as before the failed apply.
  await expect(page.getByText(`1 x ${PRICE_LABEL}`)).toBeVisible();
});
