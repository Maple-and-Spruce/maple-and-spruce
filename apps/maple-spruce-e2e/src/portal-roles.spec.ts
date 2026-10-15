import { test, expect, type Page } from '@playwright/test';
import { ADMIN, MT_TEACHER } from './fixtures';
import { signIn } from './sign-in';

/**
 * Admin-portal role scoping, end-to-end through the real Next.js app against
 * the Firebase emulators (auth + firestore + functions with the PR's own
 * code). The first browser-level proof that the scoped-roles wiring
 * (RolesProvider → getMyRoles → RoleGuard + nav filtering, epic #49) holds in
 * the assembled app — not just in unit/Storybook/integration layers.
 *
 * Seeding (global-setup.ts): ADMIN gets an admins/{uid} doc; MT_TEACHER gets a
 * userRoles/{uid} doc with roles:['mt-teacher']. Both are Auth-emulator
 * email/password users we sign in as through the login form.
 */

/** Assert a nav link is absent (role-filtered out). */
async function expectNoNavLink(page: Page, name: string): Promise<void> {
  await expect(
    page.getByRole('link', { name, exact: true })
  ).toHaveCount(0);
}

test.describe('Admin portal — role scoping', () => {
  test('MT teacher sees only Music Together + calendar, and is gated elsewhere', async ({
    page,
  }) => {
    await signIn(page, MT_TEACHER, 'Sections');

    // Sees: Music Together (Sections) + shared calendar items.
    await expect(
      page.getByRole('link', { name: 'Sections', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Events', exact: true })
    ).toBeVisible();

    // Does NOT see: store ops, class definitions, lessons, or the Admin group.
    await expectNoNavLink(page, 'Inventory');
    await expectNoNavLink(page, 'Users');
    await expectNoNavLink(page, 'Students');
    await expectNoNavLink(page, 'Instructors');

    // The Music Together page actually loads (server allowed the scoped role).
    await page.getByRole('link', { name: 'Sections', exact: true }).click();
    await expect(page).toHaveURL(/\/music-together$/);
    await expect(
      page.getByRole('heading', { name: 'Music Together', level: 1 })
    ).toBeVisible();

    // Deep-linking to an out-of-scope page hits the role gate, not the content.
    await page.goto('/users');
    await expect(
      page.getByRole('heading', { name: /Welcome to Maple & Spruce/i })
    ).toBeVisible();
    await expect(page.getByText(/don't currently have access/i)).toBeVisible();
    // The Users management UI never renders.
    await expect(page.getByRole('heading', { name: 'Users', level: 1 })).toHaveCount(
      0
    );
  });

  test('admin sees every area, opens one, and reaches its pages', async ({
    page,
  }) => {
    // Admins get the accordion: one row per area, the current one open.
    await signIn(page, ADMIN, 'Settings');

    for (const area of ['Classes', 'Lessons', 'Music Together', 'Calendar', 'Settings']) {
      await expect(
        page.getByRole('link', { name: area, exact: true })
      ).toBeVisible();
    }
    // Areas that can carry a pending-count badge.
    await expect(page.getByRole('link', { name: /^Shop/ })).toBeVisible();
    await expect(page.getByRole('link', { name: /^Money/ })).toBeVisible();
    // Pages inside closed areas stay out of the way until opened.
    await expectNoNavLink(page, 'Users');

    // Opening Settings lands on its first page and shows the rest.
    await page.getByRole('link', { name: 'Settings', exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    const settings = page.getByRole('list', { name: 'Settings pages' });
    await settings.getByRole('link', { name: 'Users', exact: true }).click();
    await expect(page).toHaveURL(/\/users$/);
    await expect(
      page.getByRole('heading', { name: 'Users', level: 1 })
    ).toBeVisible();

    // Search reaches a page in a closed area.
    await page.getByRole('textbox', { name: 'Search pages' }).fill('sections');
    await page
      .getByRole('list', { name: 'Search results' })
      .getByRole('link', { name: /Sections/ })
      .click();
    await expect(page).toHaveURL(/\/music-together$/);
  });

  test('Create → New class opens the class form on the Classes page', async ({
    page,
  }) => {
    await signIn(page, ADMIN, 'Classes');

    await page.getByRole('button', { name: 'Create' }).click();
    await page.getByRole('menuitem', { name: 'New class' }).click();

    await expect(
      page.getByRole('dialog').getByText('Add Class', { exact: true })
    ).toBeVisible();
    // The intent is consumed, so a refresh doesn't reopen the form.
    await expect(page).toHaveURL(/\/classes$/);
  });
});
