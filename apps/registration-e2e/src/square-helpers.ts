/**
 * Shared Playwright helpers for driving the registration widget's customer
 * fields and Square's sandbox card form. Used by every registration spec.
 */
import { expect, Page, FrameLocator } from '@playwright/test';

// Square sandbox test card numbers. The full reference lives at
// https://developer.squareup.com/docs/devtools/sandbox/payments. Visa
// number → approved; the decline number triggers a `GENERIC_DECLINE`
// from the Payments API.
export const SANDBOX_CARD_SUCCESS = '4111 1111 1111 1111';
export const SANDBOX_CARD_DECLINE = '4000 0000 0000 0002';
// Any future expiration / any 3-digit CVV / any valid US ZIP — Square
// doesn't validate these beyond format in sandbox.
export const SANDBOX_EXP = '12/30';
export const SANDBOX_CVV = '111';
export const SANDBOX_ZIP = '26554';

export async function fillCustomerInfo(
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
export async function fillSquareCard(
  page: Page,
  card: { number: string; exp: string; cvv: string; zip: string }
) {
  const payButton = page.getByRole('button', { name: /Register & Pay \$/ });
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
      .catch((readErr: unknown) =>
        `(could not read body: ${readErr instanceof Error ? readErr.message : String(readErr)})`
      );
    throw new Error(
      `Pay button never enabled — SDK likely failed to initialize.\nOriginal wait error: ${original}\nAlerts: ${JSON.stringify(alertText)}\nPage text (first 600 chars):\n${bodyText.slice(0, 600)}`
    );
  }

  // Single frame OR multi-frame: try each iframe under the container
  // and fill whichever input is present.
  //
  // Look for Square's frames anywhere in the page, not only under
  // `#square-card-container`: when the widget is mounted in a shadow root
  // (`?shadow=1`, as Webflow does), SquareCardForm puts the card field in a
  // container outside the shadow root, next to the widget, with no id.
  const iframeNames = await page
    .locator('iframe')
    .evaluateAll((els) =>
      (els as HTMLIFrameElement[])
        .filter((el) => /square/i.test(el.getAttribute('src') ?? ''))
        .map((el) => el.getAttribute('name') ?? '')
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
