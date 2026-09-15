import { test, expect, type Page } from '@playwright/test';
import { ADMIN } from './fixtures';
import { signIn } from './sign-in';
import {
  AMOUNTS,
  HOPE_STUDENT_ID,
  HOPE_STUDENT_NAME,
  STUDENT_ID,
  STUDENT_NAME,
  seedStudentPage,
} from './student-page-seed';

/**
 * The student page, assembled: real Next.js app, real callables, seeded
 * emulator data (#828, #853).
 *
 * The tables are covered component by component in Storybook. What only this
 * can prove is the page's wiring — that the charges reach the billing table,
 * and that Waive, Cancel and Mark paid call the server with the right
 * arguments and the table refetches into the right state afterwards.
 */

async function openStudent(page: Page, id: string, name: string) {
  await signIn(page, ADMIN, 'Students');
  await page.goto(`/students/${id}`);
  await expect(
    page.getByRole('heading', { name, level: 1 })
  ).toBeVisible({ timeout: 20_000 });
}

/** The billing row carrying an amount. Amounts are unique in the seed. */
const billingRow = (page: Page, amount: string) =>
  page.getByRole('row').filter({ hasText: amount });

test.describe('Student page — lessons and billing tables', () => {
  test.beforeEach(async () => {
    // Every test starts from the seeded state, including a retry of one that
    // already waived or paid something.
    await seedStudentPage();
  });

  test('lessons open on what is coming, with history one switch away', async ({
    page,
  }) => {
    await openStudent(page, STUDENT_ID, STUDENT_NAME);

    // The overdue lesson still waits on "Mark taught" with the switch off.
    await expect(
      page.getByRole('button', { name: /mark taught/i })
    ).toBeVisible();
    await expect(page.getByText('taught', { exact: true })).toHaveCount(0);

    await page.getByLabel(/show past lessons/i).click();
    await expect(page.getByText('taught', { exact: true })).toBeVisible();
  });

  test('billing shows what needs attention, and history on request', async ({
    page,
  }) => {
    await openStudent(page, STUDENT_ID, STUDENT_NAME);

    await expect(page.getByText(/1 charge failed/i)).toBeVisible();
    await expect(billingRow(page, AMOUNTS.failedCharge)).toContainText(
      'Card declined'
    );
    await expect(billingRow(page, AMOUNTS.chargeToWaive)).toContainText(
      'Automatic charge'
    );
    await expect(billingRow(page, AMOUNTS.sentInvoice)).toBeVisible();

    // Settled rows are hidden by default.
    await expect(billingRow(page, AMOUNTS.manualPaidCharge)).toHaveCount(0);
    await expect(billingRow(page, AMOUNTS.paidInvoice)).toHaveCount(0);

    await page.getByLabel(/show paid & closed/i).click();
    await expect(billingRow(page, AMOUNTS.manualPaidCharge)).toContainText(
      'Manual charge'
    );
    await expect(billingRow(page, AMOUNTS.paidInvoice)).toContainText(
      'Marked paid manually'
    );
  });

  test('waive, cancel and mark paid reach the server and settle the rows', async ({
    page,
  }) => {
    await openStudent(page, STUDENT_ID, STUDENT_NAME);

    // Waive: asks why, then the charge settles and leaves the default view.
    await billingRow(page, AMOUNTS.chargeToWaive)
      .getByRole('button', { name: /waive charge/i })
      .click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel(/reason/i).fill('Makeup for a cancelled lesson');
    await dialog.getByRole('button', { name: /waive \$41\.25/i }).click();
    await expect(billingRow(page, AMOUNTS.chargeToWaive)).toHaveCount(0);

    // Cancel.
    await billingRow(page, AMOUNTS.chargeToCancel)
      .getByRole('button', { name: /cancel charge/i })
      .click();
    await expect(billingRow(page, AMOUNTS.chargeToCancel)).toHaveCount(0);

    // Mark a sent invoice paid via Venmo.
    await billingRow(page, AMOUNTS.sentInvoice)
      .getByRole('button', { name: /mark invoice paid/i })
      .click();
    await page.getByRole('menuitem', { name: /paid via venmo/i }).click();
    await expect(billingRow(page, AMOUNTS.sentInvoice)).toHaveCount(0);

    // All three are on record as what was done, not merely gone.
    await page.getByLabel(/show paid & closed/i).click();
    await expect(billingRow(page, AMOUNTS.chargeToWaive)).toContainText(
      'Makeup for a cancelled lesson'
    );
    await expect(billingRow(page, AMOUNTS.chargeToWaive)).toContainText(
      'Waived'
    );
    await expect(billingRow(page, AMOUNTS.chargeToCancel)).toContainText(
      'Cancelled'
    );
    await expect(billingRow(page, AMOUNTS.sentInvoice)).toContainText(
      'Paid via Venmo'
    );

    // And it survives a reload, so it was the server, not local state.
    await page.reload();
    await expect(
      page.getByRole('heading', { name: STUDENT_NAME, level: 1 })
    ).toBeVisible({ timeout: 20_000 });
    await page.getByLabel(/show paid & closed/i).click();
    await expect(billingRow(page, AMOUNTS.chargeToCancel)).toContainText(
      'Cancelled'
    );
  });

  test('a Hope Scholarship student has no billing table', async ({ page }) => {
    await openStudent(page, HOPE_STUDENT_ID, HOPE_STUDENT_NAME);

    await expect(
      page.getByText(/invoiced through the EMA portal/i)
    ).toBeVisible();
    await expect(page.getByLabel(/show paid & closed/i)).toHaveCount(0);
    // The lessons table is still there.
    await expect(page.getByLabel(/show past lessons/i)).toBeVisible();
  });
});
