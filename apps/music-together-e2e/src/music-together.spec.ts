/**
 * Music Together enrollment FE→BE E2E.
 *
 * Drives the production `MusicTogetherRegistrationWidget` (mounted in the
 * shared registration-test-harness via `?mtSectionId=`). The same specs cover
 * two targets, picked by `E2E_TARGET`:
 *   - emulator (default) — PR check: local Vite harness + local Firebase
 *     emulator (PR's code) + real MT Square sandbox + HTTP mock servers for
 *     Webflow / Etsy.
 *   - dev               — post-merge gate: deployed harness + deployed
 *     maple-and-spruce-dev + real MT Square sandbox + real Webflow / Etsy.
 *
 * Why this suite exists (beyond the MT cloud-function integration suite):
 * - The integration suite mocks MT Square via SQUARE_BASE_URL and calls the
 *   callable directly. It can't see the browser widget's arg-shape contract,
 *   the sibling-discount price the widget renders, or the real Square Web
 *   Payments tokenize → createMusicTogetherRegistration flow.
 * - This is the highest-stakes MT flow: a family's money must route to MT's
 *   SEPARATE Square account (MT_SQUARE_KEYS), never Maple & Spruce's. A nonce
 *   tokenized against MT's sandbox app can ONLY be charged by MT's account —
 *   so a green pay-in-full is itself proof of correct multi-account routing.
 *   The `assertPaymentRoutedToMt` helper makes that explicit by reading the
 *   payment back from MT's sandbox and checking its location_id.
 *
 * The section is seeded per-run (UUID) in global-setup and its ID flows through
 * process.env.TEST_MT_SECTION_ID.
 */
import { test, expect, Page, FrameLocator } from '@playwright/test';
import {
  getFirestoreDoc,
  listFirestoreDocs,
} from '@maple/firebase/integration-test-utils';

const SECTION_ID = process.env['TEST_MT_SECTION_ID'];
if (!SECTION_ID) {
  throw new Error(
    'TEST_MT_SECTION_ID missing — globalSetup must run before specs to seed the per-run MT section doc ID.'
  );
}

const TARGET = process.env['E2E_TARGET'] ?? 'emulator';
const IS_EMULATOR = TARGET !== 'dev';

// PUBLISHED_MT_SECTION.priceFullCents = 25200 ($252). Sibling discount: 2
// children → 1.5× = $378.00. Installment 1 = $132.00.
const PRICE_FULL_1_CHILD = '$252.00';
const PRICE_FULL_2_CHILDREN = '$378.00';
const INSTALLMENT_1 = '$132.00';

// Square sandbox test card (approved). Shared across accounts — the SDK binds
// the nonce to whatever application ID the widget was built with (MT's).
const SANDBOX_CARD_SUCCESS = '4111 1111 1111 1111';
const SANDBOX_EXP = '12/30';
const SANDBOX_CVV = '111';
const SANDBOX_ZIP = '26554';

interface FamilyChild {
  name: string;
  dob: string;
}

async function openWidget(page: Page): Promise<void> {
  await page.goto(`/?mtSectionId=${SECTION_ID}`);
  // The "Pay in full" tuition option only renders once
  // getPublicMusicTogetherSection resolved AND the section is enrollment-open
  // with spots remaining. Its presence proves the load round-trip succeeded.
  // Match by role (regex, dash-agnostic) to survive typography churn.
  await expect(
    page.getByRole('radio', { name: /Pay in full/ })
  ).toBeVisible({ timeout: 30_000 });
}

test('loads the section and shows the pay-in-full tuition from the backend', async ({
  page,
}) => {
  await openWidget(page);
  await expect(
    page.getByRole('heading', { name: /Register/ })
  ).toBeVisible();
  await expect(page.getByText(/family spots remaining/)).toBeVisible();
  // 1 child (default) → un-discounted base price on the tuition option.
  await expect(
    page.getByRole('radio', { name: /\$252\.00/ })
  ).toBeVisible();
});

test.describe('Enrollment pay flow', () => {
  test.setTimeout(120_000);

  test('pay-in-full (1 child) routes money to MT and confirms the registration', async ({
    page,
  }) => {
    await openWidget(page);

    const email = `mt-e2e-full+${Date.now()}@maplespruce.test`;
    await fillFamily(page, {
      adultFirstName: 'Jamie',
      adultLastName: 'Rivera',
      children: [{ name: 'Sky', dob: '2023-04-01' }],
      email,
      phone: '304-555-1212',
      address: '123 Spruce St, Morgantown, WV 26505',
      plan: 'full',
    });

    // With 1 child the pay button reflects the un-discounted full price.
    const payButton = page.getByRole('button', { name: /Register/ });
    await fillSquareCard(page, payButton, {
      number: SANDBOX_CARD_SUCCESS,
      exp: SANDBOX_EXP,
      cvv: SANDBOX_CVV,
      zip: SANDBOX_ZIP,
    });
    await expect(payButton).toHaveText(/\$252\.00/);
    await payButton.click();

    // Confirmed view: proves tokenize (MT app) → createMusicTogetherRegistration
    // (MT account) → Square charge → Firestore write → widget transition.
    await expect(page.getByText(/You're registered/i)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(`${PRICE_FULL_1_CHILD} paid today`)).toBeVisible();
    // Pay-in-full has no scheduled installments, so no card-on-file notice.
    await expect(
      page.getByText(/automatically charged/i)
    ).toHaveCount(0);

    if (IS_EMULATOR) {
      const reg = await findConfirmedRegistration(email);
      expect(reg.pricePaidCents).toBe(25200);
      expect(reg.scheduledChargeCount).toBe(0);
      expect(String(reg.squareReceiptUrl)).toMatch(/^http/);
      await assertPaymentRoutedToMt(String(reg.squarePaymentId));
    }
  });

  test('sibling discount: 2 children pay-in-full is charged the backend-authoritative $378', async ({
    page,
  }) => {
    await openWidget(page);

    const email = `mt-e2e-sibling+${Date.now()}@maplespruce.test`;
    await fillFamily(page, {
      adultFirstName: 'Morgan',
      adultLastName: 'Lee',
      children: [
        { name: 'Robin', dob: '2022-02-02' },
        { name: 'Wren', dob: '2024-03-03' },
      ],
      email,
      phone: '304-555-3434',
      address: '77 Maple Ave, Morgantown, WV 26505',
      plan: 'full',
    });

    // Two children → 1.5× sibling multiplier → $378.00 shown on the tuition
    // option AND the pay button (both come from computeMusicTogetherFamilyPrice).
    await expect(
      page.getByRole('radio', { name: /\$378\.00/ })
    ).toBeVisible();
    const payButton = page.getByRole('button', { name: /Register/ });
    await fillSquareCard(page, payButton, {
      number: SANDBOX_CARD_SUCCESS,
      exp: SANDBOX_EXP,
      cvv: SANDBOX_CVV,
      zip: SANDBOX_ZIP,
    });
    await expect(payButton).toHaveText(/\$378\.00/);
    await payButton.click();

    await expect(page.getByText(/You're registered/i)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(`${PRICE_FULL_2_CHILDREN} paid today`)).toBeVisible();

    if (IS_EMULATOR) {
      const reg = await findConfirmedRegistration(email);
      // Backend-authoritative: $252 base × 1.5 (2 kids) = $378 = 37800¢.
      expect(reg.pricePaidCents).toBe(37800);
      await assertPaymentRoutedToMt(String(reg.squarePaymentId));
    }
  });

  test('two-installment plan vaults a card and materializes the Week-5 scheduled charge', async ({
    page,
  }) => {
    await openWidget(page);

    const email = `mt-e2e-installments+${Date.now()}@maplespruce.test`;
    await fillFamily(page, {
      adultFirstName: 'Casey',
      adultLastName: 'Nguyen',
      children: [{ name: 'Juniper', dob: '2023-06-15' }],
      email,
      phone: '304-555-5656',
      address: '9 Birch Ln, Morgantown, WV 26505',
      plan: 'installments',
    });

    const payButton = page.getByRole('button', { name: /Register/ });
    await fillSquareCard(page, payButton, {
      number: SANDBOX_CARD_SUCCESS,
      exp: SANDBOX_EXP,
      cvv: SANDBOX_CVV,
      zip: SANDBOX_ZIP,
    });
    // Installments charge only the first installment today ($132.00).
    await expect(payButton).toHaveText(/\$132\.00/);
    await payButton.click();

    await expect(page.getByText(/You're registered/i)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText(`${INSTALLMENT_1} paid today`)).toBeVisible();
    // The card-on-file notice confirms a card was vaulted + a future charge set.
    await expect(page.getByText(/automatically charged/i)).toBeVisible();

    if (IS_EMULATOR) {
      const reg = await findConfirmedRegistration(email);
      expect(reg.pricePaidCents).toBe(13200);
      expect(reg.scheduledChargeCount).toBe(1);
      expect(String(reg.squareCustomerId)).toMatch(/.+/);
      expect(String(reg.squareCardId)).toMatch(/.+/);
      await assertPaymentRoutedToMt(String(reg.squarePaymentId));

      // A scheduled card-on-file charge row was materialized for installment 2.
      const charges = (
        await listFirestoreDocs('musicTogetherScheduledCharges')
      )
        .map((c) => c.data as Record<string, unknown>)
        .filter((c) => c['registrationId'] === reg.id);
      expect(charges).toHaveLength(1);
      expect(charges[0]['status']).toBe('scheduled');
      expect(charges[0]['amountCents']).toBe(13200);
    }
  });

  test('discount code halves the charge today AND the scheduled Week-5 charge', async ({
    page,
  }) => {
    // The whole promise of the pilot half-off (#791) is "half off tuition",
    // not "half off the first payment". This drives the real widget against
    // MT's Square sandbox and then reads back what was actually stored, so a
    // regression that discounted only the charge taken at checkout — leaving
    // the family billed full price four weeks later — fails here.
    const code = process.env['TEST_MT_DISCOUNT_CODE'];
    test.skip(!code, 'globalSetup did not seed a discount code');

    await openWidget(page);

    const email = `mt-e2e-discount+${Date.now()}@maplespruce.test`;
    await fillFamily(page, {
      adultFirstName: 'Dana',
      adultLastName: 'Brooks',
      children: [{ name: 'Ash', dob: '2023-08-20' }],
      email,
      phone: '304-555-7878',
      address: '5 Cedar Ct, Morgantown, WV 26505',
      plan: 'installments',
    });

    // Baseline before the code: the un-discounted installment plan.
    const payButton = page.getByRole('button', { name: /Register/ });
    await expect(payButton).toHaveText(/\$132\.00/);

    // Apply the code — a real lookupDiscount round trip.
    await page.getByLabel('Discount code').fill(code as string);
    await page.getByRole('button', { name: /^Apply$/ }).click();
    await expect(page.getByText(`${code} applied`)).toBeVisible();

    // Both installments halve, and the widget says the second one does too.
    await expect(
      page.getByRole('radio', { name: /\$66\.00 now, \$66\.00 on/ })
    ).toBeVisible();
    await expect(
      page.getByText(/including the second installment/i)
    ).toBeVisible();

    await fillSquareCard(page, payButton, {
      number: SANDBOX_CARD_SUCCESS,
      exp: SANDBOX_EXP,
      cvv: SANDBOX_CVV,
      zip: SANDBOX_ZIP,
    });
    await expect(payButton).toHaveText(/\$66\.00/);
    await payButton.click();

    await expect(page.getByText(/You're registered/i)).toBeVisible({
      timeout: 60_000,
    });
    await expect(page.getByText('$66.00 paid today')).toBeVisible();

    if (IS_EMULATOR) {
      const reg = await findConfirmedRegistration(email);
      // Server-authoritative — the client never sends an amount.
      expect(reg.pricePaidCents).toBe(6600);
      expect(reg.discountCode).toBe(code);
      expect(reg.discountAmountCents).toBe(13200);
      // The Meta CAPI Purchase value is the discounted plan total.
      expect(reg.totalCommittedCents).toBe(13200);
      await assertPaymentRoutedToMt(String(reg.squarePaymentId));

      // THE POINT: the materialized Week-5 charge is halved too.
      const charges = (
        await listFirestoreDocs('musicTogetherScheduledCharges')
      )
        .map((c) => c.data as Record<string, unknown>)
        .filter((c) => c['registrationId'] === reg.id);
      expect(charges).toHaveLength(1);
      expect(charges[0]['amountCents']).toBe(6600);
      expect(charges[0]['status']).toBe('scheduled');
    }
  });

  test('a made-up code is refused and the price is left alone', async ({
    page,
  }) => {
    await openWidget(page);

    await fillFamily(page, {
      adultFirstName: 'Sam',
      adultLastName: 'Ortiz',
      children: [{ name: 'Rio', dob: '2023-09-09' }],
      email: `mt-e2e-badcode+${Date.now()}@maplespruce.test`,
      phone: '304-555-9090',
      address: '12 Walnut St, Morgantown, WV 26505',
      plan: 'full',
    });

    await page.getByLabel('Discount code').fill('NOTAREALCODE');
    await page.getByRole('button', { name: /^Apply$/ }).click();

    await expect(page.getByText(/isn't a valid code/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /Register/ })
    ).toHaveText(/\$252\.00/);
  });
});

// ---------------------------------------------------------------------------
// Form driving
// ---------------------------------------------------------------------------

async function fillFamily(
  page: Page,
  opts: {
    adultFirstName: string;
    adultLastName: string;
    children: FamilyChild[];
    email: string;
    phone: string;
    address: string;
    plan: 'full' | 'installments';
  }
): Promise<void> {
  // Anchored regexes: MUI appends " *" to required labels, so exact-string
  // matching fails; and a bare "First name" substring would also match
  // "Child's first name". `^First name` matches only the adult field.
  await page.getByLabel(/^First name/).fill(opts.adultFirstName);
  await page.getByLabel(/^Last name/).fill(opts.adultLastName);

  // Add child rows as needed (one row is present by default).
  for (let i = 1; i < opts.children.length; i++) {
    await page.getByRole('button', { name: /Add another child/ }).click();
  }
  const nameInputs = page.getByLabel(/Child's first name/);
  const dobInputs = page.getByLabel(/Date of birth/);
  for (let i = 0; i < opts.children.length; i++) {
    await nameInputs.nth(i).fill(opts.children[i].name);
    await dobInputs.nth(i).fill(opts.children[i].dob);
  }

  await page.getByLabel(/^Email/).fill(opts.email);
  await page.getByLabel(/^Phone/).fill(opts.phone);
  await page.getByLabel(/Full mailing address/).fill(opts.address);

  if (opts.plan === 'installments') {
    await page.getByRole('radio', { name: /Two installments/ }).check();
  }

  // Consent checkboxes: [0] policies, [1] privacy, [2] card-on-file (only when
  // the installment plan is selected). Order is stable in the widget markup.
  const checkboxes = page.getByRole('checkbox');
  await checkboxes.nth(0).check(); // policies
  await checkboxes.nth(1).check(); // privacy
  if (opts.plan === 'installments') {
    await checkboxes.nth(2).check(); // card-on-file authorization
  }
}

/**
 * Drive Square's Web Payments SDK card form, then wait for the given pay button
 * to enable. Identical strategy to the class registration E2E: wait for the
 * button to enable (proves the SDK loaded + form is valid), then fill whichever
 * iframe input is present. Selectors use HTML autocomplete attributes — stable
 * across Square SDK minor versions.
 */
async function fillSquareCard(
  page: Page,
  payButton: ReturnType<Page['getByRole']>,
  card: { number: string; exp: string; cvv: string; zip: string }
): Promise<void> {
  const alert = page.getByRole('alert');
  try {
    await expect(payButton).toBeEnabled({ timeout: 45_000 });
  } catch (err) {
    const original = err instanceof Error ? err.message : String(err);
    const alertText = (await alert.count())
      ? await alert.allInnerTexts()
      : ['(no alert visible)'];
    const bodyText = await page
      .locator('body')
      .innerText()
      .catch(
        (readErr: unknown) =>
          `(could not read body: ${readErr instanceof Error ? readErr.message : String(readErr)})`
      );
    throw new Error(
      `Pay button never enabled — SDK failed to init or the family form is invalid.\nOriginal: ${original}\nAlerts: ${JSON.stringify(alertText)}\nPage text (first 600 chars):\n${bodyText.slice(0, 600)}`
    );
  }

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
  const filled = await fillCardFields(page, iframeNames, fillers);

  if (filled.size < fillers.length) {
    const missing = fillers
      .filter(([sel]) => !filled.has(sel))
      .map(([sel]) => sel);
    throw new Error(
      `fillSquareCard: did not find input selectors ${JSON.stringify(missing)} in any iframe (saw frames=${JSON.stringify(iframeNames)})`
    );
  }
}

/** Fill each card field into whichever Square iframe contains it. */
async function fillCardFields(
  page: Page,
  iframeNames: string[],
  fillers: Array<[selector: string, value: string]>
): Promise<Set<string>> {
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
  return filled;
}

// ---------------------------------------------------------------------------
// Backend assertions (emulator target only)
// ---------------------------------------------------------------------------

/** Find the confirmed MT registration this run created, matched by email. */
async function findConfirmedRegistration(
  email: string
): Promise<Record<string, unknown> & { id: string }> {
  const docs = await listFirestoreDocs('musicTogetherRegistrations');
  const match = docs.find(
    (d) =>
      (d.data as { email?: string }).email === email &&
      (d.data as { status?: string }).status === 'confirmed'
  );
  if (!match) {
    throw new Error(
      `No confirmed musicTogetherRegistrations doc for ${email} (found ${docs.length} docs)`
    );
  }
  // Re-read the single doc so the shape matches getFirestoreDoc parsing.
  const reg = await getFirestoreDoc('musicTogetherRegistrations', match.id);
  return { ...(reg ?? match.data), id: match.id };
}

/**
 * Assert the payment landed in MT's SEPARATE Square account, not Maple &
 * Spruce's — the core multi-account-routing guarantee. Reads the payment back
 * from MT's sandbox and checks its `location_id` equals MT's location.
 *
 * Guarded by the presence of MT_SQUARE_ACCESS_TOKEN + MT_SQUARE_LOCATION_ID in
 * the runner env (set by CI). When absent (e.g. a local run without MT sandbox
 * creds) the assertion is skipped with a note — the successful charge of an
 * MT-app-tokenized nonce is already strong routing evidence on its own.
 */
async function assertPaymentRoutedToMt(paymentId: string): Promise<void> {
  const token = process.env['MT_SQUARE_ACCESS_TOKEN'];
  const expectedLocation = process.env['MT_SQUARE_LOCATION_ID'];
  if (!token || !expectedLocation) {
    console.warn(
      '[mt-e2e] Skipping MT-routing assertion — MT_SQUARE_ACCESS_TOKEN / MT_SQUARE_LOCATION_ID not in env. A successful charge of an MT-app nonce already implies MT routing.'
    );
    return;
  }
  expect(paymentId, 'registration is missing a Square payment id').toMatch(
    /.+/
  );

  const isProd =
    (process.env['MT_SQUARE_ENV'] ?? 'LOCAL').toUpperCase() === 'PROD';
  const base = isProd
    ? 'https://connect.squareup.com'
    : 'https://connect.squareupsandbox.com';

  const res = await fetch(`${base}/v2/payments/${paymentId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Square-Version': '2024-01-18',
      'Content-Type': 'application/json',
    },
  });
  expect(
    res.ok,
    `MT Square payments.get failed (${res.status}) — payment ${paymentId} not found in MT's account, which would mean money routed to the wrong Square account`
  ).toBe(true);

  const body = (await res.json()) as {
    payment?: { location_id?: string };
  };
  expect(
    body.payment?.location_id,
    'payment landed in the wrong Square location — routing did not use MT_SQUARE_KEYS'
  ).toBe(expectedLocation);
}
