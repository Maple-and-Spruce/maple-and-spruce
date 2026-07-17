'use client';

import { ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { RoleGuard } from '@maple/react/auth';
import { pageRolesForPath } from './nav-groups';

/**
 * Route-aware guard for the (admin) group: resolves the current path to
 * its allowed roles (same map that filters the nav) and applies RoleGuard
 * with them. Admins always pass; a scoped user deep-linking to a page
 * outside their roles gets the no-access screen instead of a wall of
 * failed requests. Unknown routes default to admin-only.
 *
 * UX only — real enforcement is each Cloud Function's requiringRole check.
 */
export function PathRoleGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  return (
    <RoleGuard allowedRoles={pageRolesForPath(pathname ?? '/')}>
      {children}
    </RoleGuard>
  );
}
