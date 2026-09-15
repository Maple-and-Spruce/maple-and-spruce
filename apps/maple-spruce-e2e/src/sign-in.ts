import { expect, type Page } from '@playwright/test';
import type { PortalE2EUser } from './fixtures';

/** Sign in through the real login UI and wait for the role-filtered shell. */
export async function signIn(
  page: Page,
  user: PortalE2EUser,
  navItemWhenReady: string
): Promise<void> {
  await page.goto('/login');
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Sign In' }).click();
  // A nav item only its roles unlock appears once redirect + getMyRoles +
  // nav filtering all resolve — a single wait for the whole chain.
  await expect(
    page.getByRole('link', { name: navItemWhenReady, exact: true })
  ).toBeVisible({ timeout: 20_000 });
}
