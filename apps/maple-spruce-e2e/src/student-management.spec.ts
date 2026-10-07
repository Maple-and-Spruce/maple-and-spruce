import { test, expect } from '@playwright/test';
import { ADMIN } from './fixtures';
import { signIn } from './sign-in';
import {
  OWED_STUDENT_ID,
  OWED_STUDENT_NAME,
  TWO_AHEAD_STUDENT_ID,
  TWO_AHEAD_STUDENT_NAME,
  HISTORY_STUDENT_ID,
  HOPE_BILLING_STUDENT_ID,
  HOPE_BOOKING_STUDENT_ID,
  seedStudentManagement,
} from './student-management-seed';

/**
 * Student management: the table's row actions, and the student page's three
 * tabs (#158) — Next lessons, Settings, Activity.
 *
 * Storybook covers each panel on its own. This proves the assembled wiring:
 * real lessons, weekly times and billing reach the tabs, and what Katie does
 * there reaches the server and back.
 *
 * Nothing here takes money: the e2e has no Square. Booking is exercised for
 * real on a Hope student (book only); the charge and the invoice are covered
 * by the book-and-pay unit tests and the charge-lessons-now integration suite.
 */

test.describe('Student management — task order', () => {
  test.beforeEach(async ({ page }) => {
    await seedStudentManagement();
    await signIn(page, ADMIN, 'Students');
    await page.goto('/students');
    await expect(
      page.getByRole('button', { name: `Actions for ${OWED_STUDENT_NAME}` })
    ).toBeVisible({ timeout: 20_000 });
  });

  test('the list reads like the week, and a row opens Next lessons', async ({
    page,
  }) => {
    // A student with a weekly time sits under that weekday, at that time; a
    // student with none under "No regular time" (#159).
    const noTime = page.getByRole('list', { name: 'No regular time' });
    await expect(noTime.getByRole('link', { name: new RegExp(OWED_STUDENT_NAME) })).toBeVisible();
    const twoAhead = page.getByRole('link', { name: new RegExp(TWO_AHEAD_STUDENT_NAME) });
    await expect(twoAhead).toContainText('4:00 PM');
    await expect(
      page.getByRole('list', { name: 'No regular time' }).getByText(TWO_AHEAD_STUDENT_NAME)
    ).toHaveCount(0);

    // The menu holds only edit and delete; the rest lives on the student page.
    await page
      .getByRole('button', { name: `Actions for ${OWED_STUDENT_NAME}` })
      .click();
    await expect(page.getByRole('menuitem')).toHaveText(['Edit student…', 'Delete']);
    await page.getByRole('menuitem', { name: 'Edit student…' }).click();
    await expect(page.getByRole('dialog').getByLabel(/student name/i)).toHaveValue(
      OWED_STUDENT_NAME
    );
    await page.getByRole('button', { name: 'Cancel' }).click();

    await twoAhead.click();
    await expect(page).toHaveURL(new RegExp(`/students/${TWO_AHEAD_STUDENT_ID}$`));
    await expect(
      page.getByRole('tab', { name: 'Next lessons', selected: true })
    ).toBeVisible({ timeout: 20_000 });
  });

  test('the student page opens on Next lessons, with one line to orient', async ({
    page,
  }) => {
    await page.goto(`/students/${OWED_STUDENT_ID}`);
    await expect(
      page.getByRole('heading', { name: OWED_STUDENT_NAME, level: 1 })
    ).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Cello · No weekly time')).toBeVisible();
    await expect(
      page.getByRole('tab', { name: 'Next lessons', selected: true })
    ).toBeVisible();

    // Nothing to mark, ever.
    await expect(
      page.getByRole('button', { name: /mark taught|no-show/i })
    ).toHaveCount(0);

    // No weekly time: the tab leads with setting one up, on Settings.
    await expect(
      page.getByText('No weekly time is set, so there are no lessons to propose.')
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Set a weekly time' }).click();
    await expect(page.getByRole('dialog').getByText('Set a weekly time')).toBeVisible();
    await page.getByRole('button', { name: 'Cancel' }).click();
    // Checked after the dialog closes: an open dialog hides the page behind it.
    await expect(page.getByRole('tab', { name: 'Settings', selected: true })).toBeVisible();
  });

  test('two booked lessons and a weekly time make the next four, priced as one', async ({
    page,
  }) => {
    await page.goto(`/students/${TWO_AHEAD_STUDENT_ID}`);
    const list = page.getByRole('list', { name: 'Next lessons' });
    await expect(list.getByRole('listitem')).toHaveCount(4, { timeout: 20_000 });
    await expect(list.getByText('Already on the calendar')).toHaveCount(2);

    // No card: said plainly, and the one button invoices for all four.
    await expect(page.getByText('No card on file.')).toBeVisible();
    await expect(
      page.getByRole('button', { name: 'Send an invoice for $160.00' })
    ).toBeVisible();

    // Sending it asks first; backing out sends nothing.
    await page.getByRole('button', { name: 'Send an invoice for $160.00' }).click();
    await expect(page.getByRole('dialog').getByText(/Square emails the family/)).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();
  });

  test('a Hope student books the next four in one press, and they are real', async ({
    page,
  }) => {
    await page.goto(`/students/${HOPE_BOOKING_STUDENT_ID}`);
    await page.getByRole('button', { name: 'Book 4 lessons' }).click({
      timeout: 20_000,
    });
    await expect(page.getByText(/^Booked /)).toBeVisible({ timeout: 20_000 });
    // Never offered a charge: Hope bills through EMA.
    await expect(page.getByRole('button', { name: /^Charge/ })).toHaveCount(0);

    // The server made them: they are the upcoming lessons after a reload.
    await page.goto(`/students/${HOPE_BOOKING_STUDENT_ID}?tab=settings`);
    await expect(
      page.getByRole('list', { name: 'Upcoming lessons' }).getByRole('listitem')
    ).toHaveCount(4, { timeout: 20_000 });
  });

  test('Settings: delete an upcoming lesson', async ({ page }) => {
    await page.goto(`/students/${TWO_AHEAD_STUDENT_ID}?tab=settings`);
    const upcoming = page
      .getByRole('list', { name: 'Upcoming lessons' })
      .getByRole('listitem');
    await expect(upcoming).toHaveCount(2, { timeout: 20_000 });

    await page.getByRole('button', { name: /^Delete/ }).first().click();
    await page.getByRole('button', { name: 'Delete the lesson' }).click();
    await expect(upcoming).toHaveCount(1, { timeout: 20_000 });

    await page.reload();
    await expect(upcoming).toHaveCount(1, { timeout: 20_000 });
  });

  test('Settings: edit the student', async ({ page }) => {
    await page.goto(`/students/${OWED_STUDENT_ID}?tab=settings`);
    await page
      .getByRole('button', { name: 'Edit student details' })
      .click({ timeout: 20_000 });
    await page.getByLabel(/lesson rate override/i).fill('45');
    await page.getByRole('button', { name: 'Update' }).click();
    await expect(page.getByRole('dialog')).toBeHidden({ timeout: 20_000 });

    await page.reload();
    await page
      .getByRole('button', { name: 'Edit student details' })
      .click({ timeout: 20_000 });
    await expect(page.getByLabel(/lesson rate override/i)).toHaveValue('45');
  });

  test('a Hope student: record the EMA order, then mark lessons invoiced', async ({
    page,
  }) => {
    // Billed as the product, not the old table's estimate: shown on Settings.
    await page.goto(`/students/${HOPE_BILLING_STUDENT_ID}?tab=settings`);
    await expect(
      page.getByText('Suzuki Violin Lesson - 30 min · $32.50 / lesson')
    ).toBeVisible({ timeout: 20_000 });

    await page.goto(`/students/${HOPE_BILLING_STUDENT_ID}?tab=activity`);
    await expect(page.getByText('2 need an order', { exact: true })).toBeVisible({
      timeout: 20_000,
    });

    await page.getByRole('button', { name: 'Record an order' }).first().click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('EMA order ID (optional)').fill('55501');
    await dialog.getByRole('button', { name: 'Save order' }).click();

    await expect(page.getByText('2 ready to invoice', { exact: true })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('button', { name: 'Tick all 2' }).click();
    await page.getByRole('button', { name: 'Mark 2 invoiced ($65.00)' }).click();

    await expect(page.getByText('2 invoiced', { exact: true })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('0 ready to invoice', { exact: true })).toBeVisible();

    // The server recorded it, not just the screen.
    await page.reload();
    await expect(page.getByText('2 invoiced', { exact: true })).toBeVisible({ timeout: 20_000 });
  });

  test('Activity: past lessons nobody marked are just lessons, settled quietly', async ({
    page,
  }) => {
    await page.goto(`/students/${HISTORY_STUDENT_ID}?tab=activity`);
    const rows = page
      .getByRole('list', { name: 'Lesson activity' })
      .getByRole('listitem');
    await expect(rows).toHaveCount(2, { timeout: 20_000 });
    // Not called out: no label of any kind on either.
    await expect(rows.getByText(/Paid|Invoiced|unpaid|owed/i)).toHaveCount(0);

    // But one can still be invoiced from its menu, behind a confirmation.
    await rows.first().getByRole('button', { name: /^More for/ }).click();
    await expect(page.getByRole('menuitem', { name: 'Charge the card' })).toHaveCount(0);
    await page.getByRole('menuitem', { name: 'Send an invoice' }).click();
    await expect(
      page.getByRole('dialog').getByText(/Email the family an invoice for \$40\.00/)
    ).toBeVisible();
    await page.getByRole('button', { name: 'Back' }).click();
  });
});
