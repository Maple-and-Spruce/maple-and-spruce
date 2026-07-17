import type { AppUser } from '@maple/ts/domain';
import { USER_ROLE_LABELS } from '@maple/ts/domain';

export interface UserRoleChip {
  label: string;
  color: 'default' | 'primary' | 'success' | 'warning';
}

/**
 * Reduce an AppUser's role state to chips for the list: Admin, then any
 * scoped roles (MT Teacher, Clerk, Lesson Teacher), else "No access".
 */
export function describeUserRoles(user: AppUser): UserRoleChip[] {
  const chips: UserRoleChip[] = [];
  if (user.isAdmin) {
    chips.push({ label: USER_ROLE_LABELS.admin, color: 'primary' });
  }
  for (const role of user.roles ?? []) {
    chips.push({ label: USER_ROLE_LABELS[role] ?? role, color: 'success' });
  }
  if (chips.length === 0) {
    return [{ label: 'No access', color: 'default' }];
  }
  return chips;
}
