/**
 * Registration FE→BE wiring smoke tests.
 *
 * Runs against the `registration-test-harness` Vite app, which mounts
 * the production `RegistrationWidget`. The same specs cover two
 * targets, picked by `E2E_TARGET`:
 *   - emulator (default) — PR check: local Vite harness + local
 *     Firebase emulator (PR's code) + real Square sandbox + HTTP mock
 *     servers for Webflow / Etsy (no usable sandbox for either).
 *   - dev               — post-merge gate: deployed harness + deployed
 *     maple-and-spruce-dev + real Square sandbox + real Webflow / Etsy
 *     dev integrations.
 *
 * Seeded fixtures come from `@maple/firebase/integration-test-utils`
 * via `global-setup.ts`. The class doc ID is generated per-run (UUID)
 * and propagated through `process.env.TEST_CLASS_ID` so concurrent
 * runs and the post-run teardown can attribute writes to the right
 * suite. Discount fixtures keep deterministic IDs because the specs
 * reference them by *code* (`SAVE10`, `TENOFF`), not doc ID.
 *
 * Why these tests exist:
 * - Storybook interaction tests mock `onCalculateCost`; they cannot
 *   catch a bug in the args the frontend chooses to send (#423 was
 *   exactly that — quantity off by one).
 * - Cloud-function integration tests verify the backend in isolation;
 *   they cannot see a frontend that lies about its own state.
 * - Real Firestore enforces composite indexes; the emulator does not.
 *   The dev target catches missing indexes that emulator E2E silently
 *   passes.
 * - Square Web Payments SDK + tokenize → createRegistration is the
 *   highest-stakes single flow in the app; the Pay-flow specs below
 *   exercise it against real Square sandbox infra so an SDK upgrade
 *   or a Square API breaking change surfaces as a red CI run.
 */
import { test, expect, Page, FrameLocator } from '@playwright/test';

const CLASS_ID = process.env['TEST_CLASS_ID'];
if (!CLASS_ID) {
  throw new Error(
    'TEST_CLASS_ID missing — globalSetup must run before specs to seed and publish the per-run class doc ID.'
  );
}

const PRICE_LABEL = '$45.00'; // PUBLISHED_CLASS.priceCents = 4500

// Square sandbox test card numbers. The full reference lives at
// https://developer.squareup.com/docs/devtools/sandbox/payments. Visa
// number → approved; the decline number triggers a `GENERIC_DECLINE`
// from the Payments API.
const SANDBOX_CARD_SUCCESS = '4111 1111 1111 1111';
const SANDBOX_CARD_DECLINE = '4000 0000 0000 0002';
// Any future expiration / any 3-digit CVV / any valid US ZIP — Square
// doesn't validate these beyond format in sandbox.
const SANDBOX_EXP = '12/30';
const SANDBOX_CVV = '111';
const SANDBOX_ZIP = '26554';

async function openWidget(page: Page) {
  await page.goto(`/?classId=${CLASS_ID}`);
  // The widget doesn't show the class title as a separate heading on
  // the registration view (it lives in the success view post-purchase).
  // Wait for the cost-summary line item to appear instead — its
  // presence is proof BOTH `getPublicClass` and the initial
  // `calculateRegistrationCost` round-trip succeeded. Generous timeout
  // covers cold-start of the first call (longer in dev-target mode,
  // where the deployed callable container may need to warm up).
  await expect(page.getByText(`1 x ${PRICE_LABEL}`)).toBeVisible({
    timeout: 30_000,
  });
}

test('loads cost summary from the backend', async ({ page }) => {
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

// ---------------------------------------------------------------------
// Pay-flow specs — drive the real Square Web Payments SDK in sandbox
// mode. These cost ~one sandbox tokenize + one sandbox order/payment
// roundtrip each (sandbox is free). Bumped timeout: tokenize + payments
// API roundtrip is 3-6s end to end, longer on a cold callable.
// ---------------------------------------------------------------------

test.describe('Pay flow', () => {
  test.setTimeout(120_000);

  test('completes a successful registration with a sandbox card', async ({
    page,
  }) => {
    await openWidget(page);

    await fillCustomerInfo(page, {
      name: 'E2E Tester',
      email: `e2e+${Date.now()}@maplespruce.test`,
    });

    await fillSquareCard(page, {
      number: SANDBOX_CARD_SUCCESS,
      exp: SANDBOX_EXP,
      cvv: SANDBOX_CVV,
      zip: SANDBOX_ZIP,
    });

    await page
      .getByRole('button', { name: /Register & Pay \$/ })
      .click();

    // Success view shows "You're Registered!" + confirmation number +
    // "$XX.XX paid". Asserting both proves: tokenize succeeded → token
    // reached createRegistration → Square sandbox charged → Firestore
    // registration doc written → widget transitioned to confirmed.
    await expect(page.getByText(/You're Registered/i)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText('$47.70 paid')).toBeVisible();
  });

  test('surfaces a payment error when the sandbox card is declined', async ({
    page,
  }) => {
    await openWidget(page);

    await fillCustomerInfo(page, {
      name: 'E2E Decline Tester',
      email: `e2e-decline+${Date.now()}@maplespruce.test`,
    });

    await fillSquareCard(page, {
      number: SANDBOX_CARD_DECLINE,
      exp: SANDBOX_EXP,
      cvv: SANDBOX_CVV,
      zip: SANDBOX_ZIP,
    });

    await page
      .getByRole('button', { name: /Register & Pay \$/ })
      .click();

    // Success view must NOT render — the user stays on the form with
    // a visible error. Don't pin to a specific error string (Square
    // wording changes) but require an alert and the absence of the
    // success header.
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText(/You're Registered/i)).not.toBeVisible();
  });
});

async function fillCustomerInfo(
  page: Page,
  { name, email }: { name: string; email: string }
) {
  await page.getByLabel('Full Name').fill(name);
  await page.getByLabel('Email Address').fill(email);
}

/**
 * Drive Square's Web Payments SDK card form.
 *
 * Strategy: wait for the Pay button to become enabled (proves the SDK
 * loaded, `payments()` succeeded, `card.attach()` resolved, and
 * SquareCardForm.onReady fired). At that point the iframe(s) under
 * `#square-card-container` MUST exist. If it never enables, dump the
 * page content + any visible alerts so the failure has a real cause
 * in the log instead of just "iframe not found."
 *
 * Field selectors use HTML `autocomplete` attributes (`cc-number`,
 * `cc-exp`, `cc-csc`, `postal-code`) — these are the stable, browser-
 * level identifiers for credit card fields and survive Square SDK
 * minor-version churn better than placeholder copy or DOM `name`s.
 */
async function fillSquareCard(
  page: Page,
  card: { number: string; exp: string; cvv: string; zip: string }
) {
  const payButton = page.getByRole('button', { name: /Register & Pay \$/ });
  const alert = page.getByRole('alert');

  try {
    await expect(payButton).toBeEnabled({ timeout: 45_000 });
  } catch (err) {
    const alertText = (await alert.count())
      ? await alert.allInnerTexts()
      : ['(no alert visible)'];
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(() => '(could not read body)');
    throw new Error(
      `Pay button never enabled — SDK likely failed to initialize.\nAlerts: ${JSON.stringify(alertText)}\nPage text (first 600 chars):\n${bodyText.slice(0, 600)}`
    );
  }

  // Single frame OR multi-frame: try each iframe under the container
  // and fill whichever input is present.
  const iframeNames = await page
    .locator('#square-card-container iframe')
    .evaluateAll((els) =>
      (els as HTMLIFrameElement[]).map((el) => el.getAttribute('name') ?? '')
    );

  const fillers: Array<[selector: string, value: string]> = [
    ['input[autocomplete="cc-number"]', card.number],
    ['input[autocomplete="cc-exp"]', card.exp],
    ['input[autocomplete="cc-csc"]', card.cvv],
    ['input[autocomplete="postal-code"]', card.zip],
  ];
  const filled = new Set<string>();

  for (const name of iframeNames) {
    if (!name) continue;
    const frame: FrameLocator = page.frameLocator(`iframe[name="${name}"]`);
    for (const [selector, value] of fillers) {
      if (filled.has(selector)) continue;
      const input = frame.locator(selector);
      if ((await input.count()) > 0) {
        await input.fill(value);
        filled.add(selector);
      }
    }
  }

  if (filled.size < fillers.length) {
    const missing = fillers
      .filter(([sel]) => !filled.has(sel))
      .map(([sel]) => sel);
    throw new Error(
      `fillSquareCard: did not find input selectors ${JSON.stringify(missing)} in any iframe (saw frames=${JSON.stringify(iframeNames)})`
    );
  }
}
