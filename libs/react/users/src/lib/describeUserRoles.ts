import type { AppUser } from '@maple/ts/domain';

export interface UserRoleChip {
  label: string;
  color: 'default' | 'primary' | 'success' | 'warning';
}

/**
 * Reduce an AppUser's role state to chips for the list. Currently
 * just admin / no access — the only role this app gates on. Hours and
 * payroll for non-admin staff live in Square Shifts, not here.
 */
export function describeUserRoles(user: AppUser): UserRoleChip[] {
  if (user.isAdmin) {
    return [{ label: 'Admin', color: 'primary' }];
  }
  return [{ label: 'No access', color: 'default' }];
}
