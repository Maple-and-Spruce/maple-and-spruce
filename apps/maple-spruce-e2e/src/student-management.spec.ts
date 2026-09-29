import { test, expect, type Page } from '@playwright/test';
import { ADMIN } from './fixtures';
import { signIn } from './sign-in';
import {
  OWED_STUDENT_ID,
  OWED_STUDENT_NAME,
  seedStudentManagement,
} from './student-management-seed';

/**
 * Student management in the order Katie works: edit the student, set the
 * weekly slot, charge for past lessons, line up the next ones — reachable from
 * the students table, and the same jobs on the student page.
 *
 * Storybook covers each card and the row menu on their own. This proves the
 * assembled wiring: the table's dialogs load one student's real data, and an
 * edit made on the student page reaches the server and back.
 *
 * Nothing here takes money: the e2e has no Square, so the charge itself is
 * covered by the charge-lessons-now integration suite.
 */

async function openRowAction(page: Page, action: RegExp) {
  await page
    .getByRole('button', { name: `Actions for ${OWED_STUDENT_NAME}` })
    .click();
  await page.getByRole('menuitem', { name: action }).click();
}

test.describe('Student management — task order', () => {
  test.beforeEach(async ({ page }) => {
    await seedStudentManagement();
    await signIn(page, ADMIN, 'Students');
    await page.goto('/students');
    await expect(
      page.getByRole('button', { name: `Actions for ${OWED_STUDENT_NAME}` })
    ).toBeVisible({ timeout: 20_000 });
  });

  test('the table reaches the weekly slot and the past lessons owed', async ({
    page,
  }) => {
    // No slot yet, so the dialog opens to add one, once it knows that.
    await openRowAction(page, /weekly schedule/i);
    await expect(
      page.getByRole('dialog').getByText('Add a standing slot')
    ).toBeVisible({ timeout: 20_000 });
    await page.getByRole('button', { name: 'Cancel' }).click();

    // The taught, unpaid lesson is offered, and nothing is ticked for Katie.
    await openRowAction(page, /charge for past lessons/i);
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByText('Already taught, not paid for')).toBeVisible({
      timeout: 20_000,
    });
    await expect(dialog.getByRole('checkbox')).toHaveCount(1);
    await expect(dialog.getByRole('checkbox')).not.toBeChecked();
    await dialog.getByRole('button', { name: 'Close' }).click();

    // Edit is a button on the row, not only a menu item.
    await page
      .getByRole('button', { name: `Edit ${OWED_STUDENT_NAME}`, exact: true })
      .click();
    await expect(
      page.getByRole('dialog').getByLabel(/student name/i)
    ).toHaveValue(OWED_STUDENT_NAME);
  });

  test('the student page reads in task order and edits the rate', async ({
    page,
  }) => {
    await page.goto(`/students/${OWED_STUDENT_ID}`);
    await expect(
      page.getByRole('heading', { name: OWED_STUDENT_NAME, level: 1 })
    ).toBeVisible({ timeout: 20_000 });

    const sections = page.getByRole('heading', { level: 2 });
    await expect(sections.first()).toHaveText('Standing schedule');
    const order = await sections.allTextContents();
    const at = (name: string) => order.indexOf(name);
    expect(at('Standing schedule')).toBeLessThan(at('Charge for past lessons'));
    expect(at('Charge for past lessons')).toBeLessThan(at('Next lessons'));
    expect(at('Next lessons')).toBeLessThan(at('Lessons'));
    expect(at('Lessons')).toBeLessThan(at('Payment method'));

    // Edit the rate from the page, and see it land in the header and the price.
    await page.getByRole('button', { name: 'Edit student' }).click();
    await page.getByLabel(/lesson rate override/i).fill('45');
    await page.getByRole('button', { name: 'Update' }).click();
    await expect(page.getByText(/\$45\.00\/lesson \(custom rate\)/)).toBeVisible();
    await expect(page.getByText(/· \$45\.00$/)).toBeVisible();
  });
});
