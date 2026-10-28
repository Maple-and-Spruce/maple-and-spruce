/**
 * Private group hours, end to end (#272).
 *
 * Same harness and targets as `registration.spec.ts`: the PR's own functions
 * in the emulator (PR check) or the deployed dev project (post-merge), with
 * the real Square sandbox either way. The widget is mounted in a shadow root
 * (`?shadow=1`), the way Webflow mounts code components.
 *
 * `global-setup.ts` seeds a private-hours class (two days, three hours each,
 * $60 per group) and a confirmed booking holding one hour. The tests run in
 * order: the picker, booking an open hour with a sandbox card, that hour then
 * reading as booked, and joining the waitlist for the held hour.
 *
 * Each step attaches a screenshot to the Playwright report, so a run against
 * dev doubles as a visual check of the live widget.
 */
import { test, expect, Page, TestInfo } from '@playwright/test';
import { groupPrivateHoursByDay } from '@maple/ts/domain';
import {
  SANDBOX_CARD_SUCCESS,
  SANDBOX_CVV,
  SANDBOX_EXP,
  SANDBOX_ZIP,
  fillCustomerInfo,
  fillSquareCard,
} from './square-helpers';

const CLASS_ID = process.env['TEST_HOURS_CLASS_ID'];
const STARTS = JSON.parse(process.env['TEST_HOURS_STARTS'] ?? '[]') as string[];
const HELD_INDEX = Number(process.env['TEST_HOURS_HELD_INDEX'] ?? '1');
if (!CLASS_ID || STARTS.length === 0) {
  throw new Error(
    'TEST_HOURS_CLASS_ID / TEST_HOURS_STARTS missing: globalSetup must seed the private-hours class first.'
  );
}

/** The hour this suite books; the held hour belongs to the seeded booking. */
const BOOK_INDEX = 0;

// The widget shows hours in studio time; the confirmation uses the visitor's
// zone. Pinning the browser to the studio's zone makes both predictable.
test.use({ timezoneId: 'America/New_York' });

/** Labels the widget should show, built with the same domain helper. */
const days = groupPrivateHoursByDay(
  STARTS.map((dateTime) => ({ dateTime })),
  60,
  [STARTS[HELD_INDEX]]
);
const hourLabel = (index: number): string =>
  days.flatMap((d) => d.hours).find((h) => h.start === STARTS[index])?.label ?? '';
const dayOf = (index: number) =>
  days.find((d) => d.hours.some((h) => h.start === STARTS[index]))!;

async function openWidget(page: Page): Promise<void> {
  await page.goto(`/?classId=${CLASS_ID}&shadow=1`);
  // Proof that getPublicClass and the first cost calculation both returned.
  await expect(page.getByText('1 x $60.00')).toBeVisible({ timeout: 30_000 });
}

async function snap(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  await testInfo.attach(name, {
    body: await page.screenshot({ fullPage: true }),
    contentType: 'image/png',
  });
}

/** The hour button for a seeded hour, by its label. */
function hourButton(page: Page, index: number) {
  return page.getByRole('button', { name: new RegExp(`^${escape(hourLabel(index))}`) });
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test.describe.serial('Private group hours', () => {
  test.setTimeout(120_000);

  test('shows days, hours and the hour another group holds', async ({ page }, testInfo) => {
    await openWidget(page);

    await expect(page.getByRole('heading', { name: 'Pick a day' })).toBeVisible();
    for (const day of days) {
      await expect(
        page.getByRole('button', { name: new RegExp(escape(day.label)) })
      ).toContainText(`${day.openCount} open`);
    }

    // The first day is shown: one hour free to book, one held.
    await expect(hourButton(page, BOOK_INDEX)).toBeEnabled();
    await expect(hourButton(page, HELD_INDEX)).toContainText('Booked · join waitlist');

    // A group size instead of extra attendees, and the group price once.
    await expect(page.getByRole('heading', { name: 'How many in your group?' })).toBeVisible();
    await expect(page.getByText('Anyone else coming with you?')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '$63.60' })).toBeVisible();

    await snap(page, testInfo, 'picker');
  });

  test('books an open hour with a sandbox card', async ({ page }, testInfo) => {
    await openWidget(page);

    await hourButton(page, BOOK_INDEX).click();
    await expect(hourButton(page, BOOK_INDEX)).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel(/People, up to 12/).fill('8');
    await fillCustomerInfo(page, {
      name: 'E2E Hour Host',
      email: `e2e-hours+${Date.now()}@maplespruce.test`,
    });
    await fillSquareCard(page, {
      number: SANDBOX_CARD_SUCCESS,
      exp: SANDBOX_EXP,
      cvv: SANDBOX_CVV,
      zip: SANDBOX_ZIP,
    });
    await snap(page, testInfo, 'before-pay');

    await page.getByRole('button', { name: /Register & Pay \$63\.60/ }).click();

    await expect(page.getByText(/You're Registered/i)).toBeVisible({ timeout: 60_000 });
    await expect(page.getByText('$63.60 paid')).toBeVisible();
    // The confirmation names the booked hour, not the class's first session.
    const expectedWhen = new Date(STARTS[BOOK_INDEX]).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      timeZone: 'America/New_York',
    });
    await expect(page.getByText(expectedWhen)).toBeVisible();

    await snap(page, testInfo, 'confirmed');
  });

  test('the booked hour now reads as booked', async ({ page }, testInfo) => {
    await openWidget(page);

    const day = dayOf(BOOK_INDEX);
    await expect(
      page.getByRole('button', { name: new RegExp(escape(day.label)) })
    ).toContainText(`${day.openCount - 1} open`);
    await expect(hourButton(page, BOOK_INDEX)).toContainText('Booked · join waitlist');

    await snap(page, testInfo, 'after-booking');
  });

  test('joins the waitlist for a booked hour', async ({ page }, testInfo) => {
    await openWidget(page);

    await hourButton(page, HELD_INDEX).click();
    const when = `${dayOf(HELD_INDEX).label}, ${hourLabel(HELD_INDEX)}`;
    await expect(page.getByText(`${when} is booked.`, { exact: false })).toBeVisible();

    // The waitlist form's email field comes first; "Your Information" has
    // its own Email Address field further down.
    await page
      .getByLabel('Email Address')
      .first()
      .fill(`e2e-waitlist+${Date.now()}@maplespruce.test`);
    await page.getByRole('button', { name: 'Join waitlist', exact: true }).click();

    await expect(
      page.getByText(`You're on the waitlist for ${when}.`, { exact: false })
    ).toBeVisible({ timeout: 30_000 });

    await snap(page, testInfo, 'waitlist-joined');
  });
});
