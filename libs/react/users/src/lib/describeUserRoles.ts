import type { AppUser } from '@maple/ts/domain';

export interface UserRoleChip {
  label: string;
  color: 'default' | 'primary' | 'success' | 'warning';
}

/**
 * Reduce an AppUser's role state to the set of chips to render in the list.
 * Inactive employees are surfaced as a separate (muted) chip so admins can
 * tell a user has a payroll record without thinking they currently have
 * timesheet access.
 */
export function describeUserRoles(user: AppUser): UserRoleChip[] {
  const chips: UserRoleChip[] = [];
  if (user.isAdmin) {
    chips.push({ label: 'Admin', color: 'primary' });
  }
  if (user.employee) {
    if (user.employee.status === 'active') {
      chips.push({ label: 'Employee', color: 'success' });
    } else {
      chips.push({ label: 'Employee (inactive)', color: 'default' });
    }
  }
  if (chips.length === 0) {
    chips.push({ label: 'No access', color: 'default' });
  }
  return chips;
}
