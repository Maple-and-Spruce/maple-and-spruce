import { test, expect, type Page } from '@playwright/test';
import { ADMIN, MT_TEACHER } from './fixtures';
import { signIn } from './sign-in';

/**
 * Admin-portal role scoping, end-to-end through the real Next.js app against
 * the Firebase emulators (auth + firestore + functions with the PR's own
 * code). The first browser-level proof that the scoped-roles wiring
 * (RolesProvider → getMyRoles → RoleGuard + nav filtering, epic #617) holds in
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

  test('admin sees the full nav including the Admin group', async ({ page }) => {
    await signIn(page, ADMIN, 'Users');

    await expect(
      page.getByRole('link', { name: 'Users', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Inventory', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Sections', exact: true })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Students', exact: true })
    ).toBeVisible();

    // The Users page loads for an admin.
    await page.getByRole('link', { name: 'Users', exact: true }).click();
    await expect(page).toHaveURL(/\/users$/);
    await expect(
      page.getByRole('heading', { name: 'Users', level: 1 })
    ).toBeVisible();
  });
});
